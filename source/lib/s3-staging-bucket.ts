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

import { RemovalPolicy, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";

export class StagingBucket extends Construct {
    public readonly Bucket: s3.IBucket;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const securitySettings: s3.BucketProps = {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: RemovalPolicy.DESTROY,
        };

        const rules: s3.LifecycleRule[] = [
            {
                id: "multipart-upload-rule",
                enabled: true,
                abortIncompleteMultipartUploadAfter: Duration.days(7),
            },
        ];

        this.Bucket = new s3.Bucket(this, "StagingBucket", {
            ...securitySettings,
        });
        (this.Bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId("stagingBucket");
        this.addCfnNagSuppressions(this.Bucket);

        this.Bucket.addToResourcePolicy(
            new iam.PolicyStatement({
                resources: [`${this.Bucket.bucketArn}`, `${this.Bucket.bucketArn}/*`],
                actions: ["s3:*"],
                principals: [new iam.AnyPrincipal()],
                effect: iam.Effect.DENY,
                conditions: {
                    Bool: {
                        "aws:SecureTransport": "false",
                    },
                },
            })
        );

        this.addCfnNagSuppressions(this.Bucket);
    }

    private addCfnNagSuppressions(bucket: s3.IBucket) {
        const rules = [
            {
                id: "W51",
                reason: "This bucket does not need a bucket policy",
            },
            {
                id: "W35",
                reason: "Temporary storage - access logs are not required. EngSec exemption received.",
            },
        ];

        const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
        cfnBucket.cfnOptions.metadata = {
            cfn_nag: {
                rules_to_suppress: rules,
            },
        };
    }
}
