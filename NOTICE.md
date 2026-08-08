# Licensing & attribution

## The code — GPL-2.0-or-later

This repository is a fork of [rocktools](https://github.com/markstock/rocktools) by
**Mark J. Stock** (<https://markjstock.org/rocktools/>), a C toolkit for creating and
manipulating triangular meshes, started in 1999.

> rocktools — Tools for creating and manipulating triangular meshes
> Copyright (C) 1999, 2006-7, 9, 14 Mark J. Stock
>
> This program is free software; you can redistribute it and/or modify it under the terms
> of the GNU General Public License as published by the Free Software Foundation; either
> version 2 of the License, or (at your option) any later version.

The original C sources (`rock*.c`, `*util.c`, `structs.h`, the Makefiles) carry that
notice in their headers. Rocktools Studio compiles them to WebAssembly and wraps them in a
web application, which makes this repository as a whole a derivative work: **the whole
thing is GPL-2.0-or-later**. The full license text is in [LICENSE](LICENSE).

Additions by the fork maintainer — the WASM build, the studio client, mesh modifiers,
shader effects, the pipeline editor and the headless CLI — are likewise released under
GPL-2.0-or-later.

### What this does *not* cover

Meshes produced *by* these tools are the output of running a program, not a derivative of
its source. They belong to whoever generated them and carry no GPL obligation. The asteroid
meshes in [oni-assets-asteroids](https://github.com/kafeg/oni-assets-asteroids) are
licensed separately on that basis.

`studio/client/src/runtime/asteroid/` is a standalone Three.js material and shader layer
that renders finished meshes. It calls no rocktools code and does not depend on the WASM
build; it is synced into [ONI](https://github.com/kafeg/oni) as a separable module under
that project's own license.

## Bundled assets

| Assets | Source | License |
|---|---|---|
| `studio/client/public/hdri/NightSkyHDRI*.exr` | [ambientCG](https://ambientcg.com/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain |
| `studio/client/public/textures/acg_*.jpg` | [ambientCG](https://ambientcg.com/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain |
| `studio/client/public/textures/` (all other `*.png`) | Procedurally generated for this project | GPL-2.0-or-later, as above |

ambientCG does not require attribution; it is credited here anyway.
