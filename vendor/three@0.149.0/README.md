# three.js 0.149.0 (vendored)

- Source: npm package `three@0.149.0` (`build/three.min.js`, `LICENSE`), fetched 2026-11-18 from cdn.jsdelivr.net/npm/three@0.149.0/.
- sha256 three.min.js: 8a5f7249903b54d30f79f708699d2fed2d6a1d0741a4cd41377d1f01bb5a2271
- License: MIT (see LICENSE).
- Why 0.149.0: a release that still ships the classic UMD build (`window.THREE`) without the deprecation warning that r150-r159 print (r160 removed it), so it loads with a plain `<script src>` like every other Game DNA module and works from `file://` without import maps or a server. Never load "latest"; a version bump is a new folder.
- Elements that use it copy this file next to their module; baskets ship it as `three.min.js`.
