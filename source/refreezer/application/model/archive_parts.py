"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

from typing import Dict, Any

class ArchivePartsModel:
    def __init__(self, archive_id: str):
        self.archive_id = archive_id
        self.parts_result: Dict[str, Any] = {}
        self.part_number = 0
        self.byte_range = ""
        self.e_tag = ""
        self.hash = ""

    @property
    def primary_key(self) -> str:
        return "archive_id"    
    
    @property
    def sort_key(self) -> str:
        return "part_number"
