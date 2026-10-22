# Blacktide third-party licensing notes

## BURN City dependencies

- **Three.js**: Blacktide imports the copy already vendored by BURN City from `client/vendor/three/`. Review the vendored package's own license files before redistributing any build outside the existing project.

## Open-source pirate-game reference

- **Corsairs: Wind of Freedom** — https://github.com/Elkhan-Isayev/corsairs
- Upstream repository identifies its license as MIT. The MIT license requires retaining the copyright and permission notice when distributing copies or substantial portions of that software.
- Blacktide's initial prototype does not copy Corsairs source files or assets. It is a browser-native implementation using BURN City's existing Three.js dependency.
- If code is later ported or copied from Corsairs, record the exact upstream commit, files, license notice, and any third-party asset licenses in this file before merging.
- **Tempest: Pirate Action RPG** is a commercial game; its proprietary source code and assets are not assumed to be open source and are not used here.

This file is a development record, not legal advice.

## The Legend of Pirates Online — libpirates-src

- Source repository: https://github.com/TheLegendOfPiratesOnline/libpirates-src
- License: BSD 3-Clause; copyright © 2017 The Legend of Pirates Online.
- Use in Blacktide: the new `ocean.js` is an original JavaScript/Three.js wave approximation informed by the upstream README's documented multi-directional wave configuration. No C++/Panda3D source file has been copied into Blacktide.
- The upstream project is engine-specific (Panda3D). Any future direct source reuse must preserve the full notice below and be reviewed file-by-file.

BSD 3-Clause License

Copyright (c) 2017, The Legend of Pirates Online
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
