# GullyCricket landing page

A single-page, scroll-driven launch site: one persistent WebGL canvas behind real HTML, with six pinned chapters scrubbed to scroll. Everything you see is a placeholder (copy, numbers, app screens); the structure and motion are the deliverable.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/, deploy anywhere
```

## The story

| # | Chapter | 3D |
|---|---------|----|
| 1 | Hero | Lacquered ball under a rim light; camera pushes into the seam |
| 2 | The delivery | Pull back down a floodlit pitch; the ball is bowled at the viewer (swing, bounce, trail) and caught in front of the lens |
| 3 | The phone | Phone turns into frame; ball drops into the screen, which ripples on |
| 4 | Features (3 steps) | Phone re-poses per step, screen wipes; player cards fan out, points chips fly, a trophy rises |
| 5 | Stadium | Low-poly ground at night; towers flick on one by one as the camera rises; counters climb |
| 6 | CTA | Product shot on chalk; store buttons, footer with responsible-play, 18+ and region notes |

Each chapter ends on exactly the pose the next one starts from (`src/scene/story.js`), so the page reads as one continuous shot.

## Replacing placeholders

- **Brand name**: `VITE_BRAND_NAME` in `.env`
- **Copy, stats, store links, footer**: `index.html`
- **App screens**: drop screenshots in `public/screens/` and set paths in `SCREEN_IMAGES` (`src/scene/props/screens.js`); until then they are drawn in code
- **Ball / phone**: procedural (`src/scene/props/`); a Draco GLB can replace either via `loadModel()` in `src/scene/assets.js`

## How it fits together

```
src/main.js                 boot: loader, Lenis, scene, chapters
src/animations/             GSAP: smooth scroll, hero intro, one scrubbed timeline per chapter
src/scene/Stage.js          renderer/camera, render loop on GSAP's ticker
src/scene/SectionManager.js lazy-loads each chapter ~1 viewport ahead, disposes it ~1 viewport after
src/scene/rig.js            the single shared key light / environment / fog
src/scene/<chapter>.js      one module per chapter; reads its scroll progress `u` and poses the shot
src/scene/props/            shared ball, phone, generated app screens
```

- Every chapter's 3D is a pure function of scroll progress, so it scrubs backwards as cleanly as forwards.
- The light count never changes (stadium floodlights are shader-only), so nothing recompiles mid-scroll; lazily loaded chapters are compiled asynchronously before they appear.
- Pixel ratio is capped at 2 (1.5 on mobile). Mobile drops shadows, fine shader detail and the stadium stands/crowd.
- `prefers-reduced-motion`: no smooth scroll, no pins or scrubbing; each chapter shows a static render.
- Page weight is ~1.9 MB on first load (1.6 MB of that is the HDRI).

## Deploy (home server)

The build is plain static files, so the server's existing nginx serves them directly: no new port, no pm2 process, no running container. Docker is only used for a throwaway build, so the host's Node version is never touched.

One-time setup on the server:

```bash
git clone https://github.com/beekntr/gullycricket.git ~/apps/gullycricket
sudo mkdir -p /var/www/gullycricket && sudo chown "$USER": /var/www/gullycricket
~/apps/gullycricket/deploy/deploy.sh

sudo cp ~/apps/gullycricket/deploy/gullycricket-site.conf /etc/nginx/snippets/
sudo cp ~/apps/gullycricket/deploy/gullycricket.nginx.conf /etc/nginx/sites-available/gullycricket.kshitijsinghbhati.in
sudo ln -s /etc/nginx/sites-available/gullycricket.kshitijsinghbhati.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Cloudflare proxies the domain. With SSL/TLS mode **Flexible**, the port 80 block is enough. With **Full** or **Full (strict)**, uncomment the 443 block in the nginx config and point it at the certificate your other subdomains already use.

Every update after that:

```bash
~/apps/gullycricket/deploy/deploy.sh
```
