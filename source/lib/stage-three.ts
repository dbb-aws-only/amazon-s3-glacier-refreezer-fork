/*********************************************************************************************************************
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

/**
 * @author Solution Builders
 */

"use strict";

import { Construct } from "constructs";
import { CfnResource, Duration, Aws } from "aws-cdk-lib";
import { aws_dynamodb as dynamo } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_sqs as sqs } from "aws-cdk-lib";
import { aws_sns as sns } from "aws-cdk-lib";
import { aws_sns_subscriptions as subscriptions } from "aws-cdk-lib";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_lambda_event_sources as eventsource } from "aws-cdk-lib";
import * as iamSec from "./iam-permissions";
import * as path from "path";
import { CfnNagSuppressor } from "./cfn-nag-suppressor";

export interface StageThreeProps {
    readonly sourceVault: string;
    readonly stagingBucket: s3.IBucket;
    readonly statusTable: dynamo.ITable;
    readonly metricTable: dynamo.ITable;
    readonly archiveNotificationTopic: sns.ITopic;
}

export class StageThree extends Construct {
    readonly treehashCalcQueue: sqs.IQueue;
    readonly archiveNotificationQueue: sqs.IQueue;

    constructor(scope: Construct, id: string, props: StageThreeProps) {
        super(scope, id);

        // -------------------------------------------------------------------------------------------
        // Treehash Calc Request Queue
        const treehashCalcQueue = new sqs.Queue(this, "treehash-calc-queue", {
            queueName: `${Aws.STACK_NAME}-treehash-calc-queue`,
            retentionPeriod: Duration.days(14),
            visibilityTimeout: Duration.seconds(905),
        });
        CfnNagSuppressor.addSuppression(
            treehashCalcQueue,
            "W48",
            "Non sensitive metadata - encryption is not required and cost inefficient"
        );
        treehashCalcQueue.addToResourcePolicy(iamSec.IamPermissions.sqsDenyInsecureTransport(treehashCalcQueue));
        this.treehashCalcQueue = treehashCalcQueue;

        // -------------------------------------------------------------------------------------------
        // Archive Notification Queue
        const archiveNotificationQueue = new sqs.Queue(this, "archive-notification-queue", {
            queueName: `${Aws.STACK_NAME}-archive-notification-queue`,
            visibilityTimeout: Duration.seconds(905),
        });
        CfnNagSuppressor.addSuppression(
            archiveNotificationQueue,
            "W48",
            "Non sensitive metadata - encryption is not required and cost inefficient"
        );
        archiveNotificationQueue.addToResourcePolicy(
            iamSec.IamPermissions.sqsDenyInsecureTransport(archiveNotificationQueue)
        );
        props.archiveNotificationTopic.addSubscription(new subscriptions.SqsSubscription(archiveNotificationQueue));
        this.archiveNotificationQueue = archiveNotificationQueue;

        // -------------------------------------------------------------------------------------------
        // Chunk Copy Queue
        const chunkCopyQueue = new sqs.Queue(this, "chunk-copy-queue", {
            queueName: `${Aws.STACK_NAME}-chunk-copy-queue`,
            visibilityTimeout: Duration.seconds(905),
        });
        CfnNagSuppressor.addSuppression(
            chunkCopyQueue,
            "W48",
            "Non sensitive metadata - encryption is not required and cost inefficient"
        );
        chunkCopyQueue.addToResourcePolicy(iamSec.IamPermissions.sqsDenyInsecureTransport(chunkCopyQueue));

        // -------------------------------------------------------------------------------------------
        // Split Archive into Chunks
        const splitArchiveRole = new iam.Role(this, "splitArchiveRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        });

        // Declaring the policy granting access to the stream explicitly to minimize permissions
        splitArchiveRole.addToPrincipalPolicy(iamSec.IamPermissions.lambdaLogGroup(`${Aws.STACK_NAME}-splitArchive`));
        splitArchiveRole.addToPrincipalPolicy(iamSec.IamPermissions.glacier(props.sourceVault));
        splitArchiveRole.addToPrincipalPolicy(iamSec.IamPermissions.sqsSubscriber(archiveNotificationQueue));

        props.stagingBucket.grantReadWrite(splitArchiveRole);
        props.statusTable.grantReadWriteData(splitArchiveRole);
        chunkCopyQueue.grantSendMessages(splitArchiveRole);
        treehashCalcQueue.grantSendMessages(splitArchiveRole);

        const defaultSplitArchivePolicy = splitArchiveRole.node.findChild("DefaultPolicy").node
            .defaultChild as CfnResource;
        CfnNagSuppressor.addCfnSuppression(defaultSplitArchivePolicy, "W76", "Policy is auto-generated by CDK");

        const splitArchive = new lambda.Function(this, "SplitArchive", {
            functionName: `${Aws.STACK_NAME}-splitArchive`,
            runtime: lambda.Runtime.NODEJS_16_X,
            handler: "index.handler",
            memorySize: 256,
            timeout: Duration.minutes(15),
            reservedConcurrentExecutions: 45,
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/splitArchive")),
            role: splitArchiveRole.withoutPolicyUpdates(),
            environment: {
                STAGING_BUCKET: props.stagingBucket.bucketName,
                STAGING_BUCKET_PREFIX: "stagingdata",
                STATUS_TABLE: props.statusTable.tableName,
                SQS_CHUNK: chunkCopyQueue.queueName,
                SQS_HASH: treehashCalcQueue.queueName,
            },
        });
        splitArchive.node.addDependency(splitArchiveRole);
        splitArchive.addEventSource(new eventsource.SqsEventSource(archiveNotificationQueue, { batchSize: 1 }));
        CfnNagSuppressor.addLambdaSuppression(splitArchive);

        // -------------------------------------------------------------------------------------------
        // Copy Chunk
        const copyChunkRole = new iam.Role(this, "CopyChunkRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        });

        copyChunkRole.addToPrincipalPolicy(iamSec.IamPermissions.lambdaLogGroup(`${Aws.STACK_NAME}-copyChunk`));
        copyChunkRole.addToPrincipalPolicy(iamSec.IamPermissions.glacier(props.sourceVault));
        copyChunkRole.addToPrincipalPolicy(iamSec.IamPermissions.sqsSubscriber(chunkCopyQueue));

        const defaultCopyChunkPolicy = copyChunkRole.node.findChild("DefaultPolicy").node.defaultChild as CfnResource;
        CfnNagSuppressor.addCfnSuppression(defaultCopyChunkPolicy, "W76", "Policy is auto-generated by CDK");

        props.stagingBucket.grantReadWrite(copyChunkRole);
        props.statusTable.grantReadWriteData(copyChunkRole);
        props.metricTable.grantReadWriteData(copyChunkRole);
        treehashCalcQueue.grantSendMessages(copyChunkRole);

        const copyChunk = new lambda.Function(this, "CopyChunk", {
            functionName: `${Aws.STACK_NAME}-copyChunk`,
            runtime: lambda.Runtime.NODEJS_16_X,
            handler: "index.handler",
            memorySize: 1024,
            timeout: Duration.minutes(15),
            reservedConcurrentExecutions: 35,
            role: copyChunkRole.withoutPolicyUpdates(),
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/copyChunk")),
            environment: {
                VAULT: props.sourceVault,
                STAGING_BUCKET: props.stagingBucket.bucketName,
                STAGING_BUCKET_PREFIX: "stagingdata",
                STATUS_TABLE: props.statusTable.tableName,
                METRIC_TABLE: props.metricTable.tableName,
                SQS_HASH: treehashCalcQueue.queueName,
            },
        });
        CfnNagSuppressor.addLambdaSuppression(copyChunk);
        copyChunk.addEventSource(new eventsource.SqsEventSource(chunkCopyQueue, { batchSize: 1 }));
    }
}
