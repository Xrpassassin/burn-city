# Combined nature + birds preview: isolation checklist

This branch is **not** approved for production deployment. The live Fly image may run `/data/boot.sh`, which fetches GitHub refs and can override image contents; NEVER mount the production `bcg_data` volume into a preview.

## Independent local browser preview

1. Checkout `integration/city-nature-birds-20261027` (do not merge).
2. Build: `docker build -t burn-city-environment-preview .`
3. Run isolated: `docker run --rm --name burn-city-environment-preview -e PORT=8080 -e DRY_RUN=true -e BURN_JOB_IN_SERVER=false -p 127.0.0.1:8081:8080 burn-city-environment-preview`.
   - **Do not** pass wallet keys, production secrets, production service variables, or any `-v /data` / named volume mount. No Fly deploy required.
   - Without `/data/boot.sh`, this container uses the tested source baked into the image. It may need stub/read-only XRPL access depending on local environment; do not transact.
4. Open `http://127.0.0.1:8081/?q=low`, then compare against `?q=low&nonature&nobirds`; repeat `?q=medium`, `?q=high`.
5. Check roads, tower entrance, lake, forest path, estates entrance, desktop camera and phone viewport. Record FPS, draw calls, JS exceptions, clipping, and screenshot comparisons.
6. Check network responses for `/js/city-nature-render.mjs` and `/js/city-birds-render.mjs`; both should be 200 *inside preview only*. Confirm live Fly URLs remain unchanged.
7. If any runtime problem occurs, keep draft open. Do **not** merge umbrella PR #322. Merge the individually reviewed #320 and #321 only after independent approval.

## Scope and limitations

The seven automated integration checks passing prove smoke-test correctness, not GPU performance or visual quality. The current runtime cannot claim to have launched this browser preview. The existing live Fly `/data/boot.sh` is a deployment-specific risk and must be inspected before claiming any production visual is deployed.
