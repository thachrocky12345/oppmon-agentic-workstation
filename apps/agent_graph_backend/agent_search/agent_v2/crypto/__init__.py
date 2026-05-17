# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Cryptographic helpers for agent_search.

TAG-54 adds ``vault.decrypt_secret`` — XSalsa20-Poly1305 decryption that
mirrors ``apps/api/src/crypto/secret-vault.ts`` so the Express signer
and the FastAPI consumer share one ciphertext format.
"""

from .vault import (
    VaultError,
    decrypt_secret,
    encrypt_secret,
    is_configured,
)

__all__ = [
    "VaultError",
    "decrypt_secret",
    "encrypt_secret",
    "is_configured",
]
