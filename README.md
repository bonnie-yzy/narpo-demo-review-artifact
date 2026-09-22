# NARPO demo

**NARPO: Native Reward Post-Training for Decoding-Robust Masked Speech Generation**

Static companion page with the paper abstract, method overview, training
figures, and two listening chapters:

- Zero-shot Voice Cloning: 4 English and 4 Chinese examples selected for the
  paper demo.
- Decoding Robustness: matched Base, distillation, and NARPO examples across
  eight decoding budgets and CFG 0/2. CFG and step distillation are separate models.

## Preview and hosting

Serve this directory with any static HTTP server. No build, backend, package
installation, external scripts, or credentials are required. Relative asset
paths support both a domain root and a repository subdirectory, including
GitHub Pages. Uploading this repository does not itself enable website hosting.

Audio loads only on playback. Language tabs, incremental example display,
and lazy-loaded figures reduce initial work. Reference transcripts remain
visible beneath their players. Without JavaScript, native audio controls
are available at the default decoding setting.

## Repository scope

This repository contains only the display page and its required media assets.
Training code, checkpoints, raw metrics, experiment logs, private manifests,
local server configuration, and development history are not included.

Ancillary audio editing metadata was removed from release copies without
changing decoded audio samples. Original research artifacts are preserved
separately. Curated examples are illustrative, not a human preference study.
