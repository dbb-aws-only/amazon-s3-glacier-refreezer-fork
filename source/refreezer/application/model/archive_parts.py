"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

import logging
from typing import Dict, Any

logger = logging.getLogger()


class StatusCode:
    SUCCEEDED = "Succeeded"
    FAILED = "Failed"
    IN_PROGRESS = "InProgress"

class ArchivePartsModel:
    def __init__(self, archive_id: str):
        self.archive_id = archive_id
        self.parts_result: Dict[str, Any] = {}
        self.byte_range = ""
        self.e_tag = ""
        self.hash = ""

    @property
    def primary_key(self) -> str:
        return "archive_id"
    
    def check_parts_success_status(self) -> bool:
        result: bool = self.parts_result["StatusCode"] == StatusCode.SUCCEEDED
        result_str = "succeeded" if result else "has not succeeded"
        getattr(logger, "debug" if result else "error")(
            f"The parts with archive-id {self.archive_id} {result_str}"
        )
        return result
    
    def check_if_parts_finished(self) -> bool:
        if self.parts_result["StatusCode"] == StatusCode.IN_PROGRESS:
            logger.info(f"The parts with archive-id {self.archive_id} is still in progress")
            return False
        return True
    
    def get_hash(self) -> str:
        return self.hash
    
    def get_byte_range(self) -> str:
        return self.byte_range
    
    def get_e_tag(self) -> str:
        return self.e_tag   
    
    def get_parts_result(self) -> Dict[str, Any]:
        return self.parts_result
    
    def get_archive_id(self) -> str:
        return self.archive_id
    
    def set_hash(self, hash: str) -> None:
        self.hash = hash

    def set_byte_range(self, byte_range: str) -> None:
        self.byte_range = byte_range

    def set_e_tag(self, e_tag: str) -> None:
        self.e_tag = e_tag

    def set_parts_result(self, parts_result: Dict[str, Any]) -> None:
        self.parts_result = parts_result

    def set_archive_id(self, archive_id: str) -> None:
        self.archive_id = archive_id