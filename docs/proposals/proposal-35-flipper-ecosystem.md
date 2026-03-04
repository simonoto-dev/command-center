# Proposal 35: Flipper Zero WiFi Bridge + FlipPet Updates

**Status:** Completed
**Date:** 2026-03-04
**Branch:** gift/proposal-35

## Changes Made

### 1. WiFi Upload Script — Connection Retry Logic
**File:** `hardware/flipper-wifi-bridge/wifi_upload.py`

Added robust retry logic for stale ESP32 connections:
- `_connect_with_retry()` — 3 connection attempts with increasing backoff (2s, 4s)
- `_drain_socket()` — reusable helper to clear buffered data from stale sessions
- Separate connect timeout (8s) vs ACK timeout (5s)
- Clean error reporting with attempt numbers

Previously the script would fail silently on stale connections from interrupted uploads. Now it recovers automatically.

### 2. BadKB Script Toolkit
**Directory:** `hardware/flipper-wifi-bridge/badkb/`

Organized 7 existing Pi2 admin scripts into a dedicated toolkit directory with README:
- **Network setup:** `pi2_network_fix.txt`, `pi2_netfix.txt`, `pi2_wifi.txt`, `pi2_wifiup.txt`
- **Diagnostics:** `pi2_ipcheck.txt`, `pi2_diag.txt`
- **Services:** `pi2_ssh.txt`

Proven workflow for headless Pi management via Flipper Zero BadKB.

### 3. FlipPet Icon Fix
**Files:** All `flippet_10px.png` across v1-v4

Root cause: original PNG was RGB with alpha channel. Flipper Zero requires **1-bit indexed PNG** (color type 3, bit depth 1) with a 2-color palette (white background, black foreground).

Fix:
- Created `icon_gen.py` — pure Python 1-bit PNG generator (no PIL dependency)
- Generated proper 10x10 paw print icon (102 bytes, indexed color)
- Added `fap_icon` to v2, v3, v4 application.fam files (v1 already had it)

### 4. FlipPet Mood Boost from Flipper Interactions
**File:** `hardware/flippet/v1_gameboy/flippet_gb.c`

Two-way bond between FlipPet and Flipper's internal Dolphin system:

- **Flipper → Pet:** On app launch, reads Flipper's dolphin level. +1 happiness per level (up to +30). Active Flipper users = happier pet.
- **Pet → Flipper:** Petting FlipPet (OK button) calls `dolphin_deed(DolphinDeedPluginGameWin)`, awarding Flipper XP.
- **Welcome-back bonus:** +15 happiness if away >1 hour, +5 if away >5 minutes (was missing from v1; v2-v4 already had the 1-hour bonus).

## Files Changed (Hardware — Syncthing, not git)

- `hardware/flipper-wifi-bridge/wifi_upload.py`
- `hardware/flipper-wifi-bridge/badkb/` (new directory + 7 scripts + README)
- `hardware/flippet/icon_gen.py` (new)
- `hardware/flippet/v1_gameboy/flippet_gb.c`
- `hardware/flippet/v1_gameboy/flippet_10px.png`
- `hardware/flippet/v2_tamagotchi/flippet_10px.png` (new)
- `hardware/flippet/v2_tamagotchi/application.fam`
- `hardware/flippet/v3_nes/flippet_10px.png` (new)
- `hardware/flippet/v3_nes/application.fam`
- `hardware/flippet/v4_indie/flippet_10px.png` (new)
- `hardware/flippet/v4_indie/application.fam`

## Pending

- Rebuild FAP binaries with `ufbt` to verify icon renders correctly on actual Flipper hardware
- Test wifi_upload.py retry with a real stale ESP32 connection
- Consider adding mood boost to v2-v4 versions as well
