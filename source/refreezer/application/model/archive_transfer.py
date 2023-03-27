"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

class ArchiveTransferModel:
    def __init__(self, workflow_run_id: str, archive_id: str):
        self.workflow_run_id = workflow_run_id
        self.archive_id = archive_id
        self.glacier_id = ""
        self.creation_date = ""
        self.description = ""
        self.size = 0
        self.sha256_tree_hash = ""
        self.etag = ""
        self.byte_range = ""
        self.tracking = ""
        self.initiate = ""

    @property
    def primary_key(self) -> str:
        return "pk"

