# 絕命高塔 · SPIRE OF PERIL

A tower obby in the browser, in the spirit of Roblox's *Tower of Hell*: a tower of obstacle sections stacked into one column,
**no checkpoints**, and a clock. Touch red and you start again from the bottom; fall off and you land further down. When the
timer runs out a brand-new tower rises. Chinese and English, keyboard or touch.

**Play:** https://ywchen0711.github.io/spire-of-peril/

Built with [three.js](https://threejs.org/) (pinned to 0.160.0 from a CDN); every texture and sound is made in code.

## The tower

Each round stacks 6 to 8 sections, easier ones low and harder ones high, turned and mirrored at random:

| | |
|---|---|
| 階梯 Stairway, 玻璃階梯 Glass Steps, 螺旋 Spiral | floating blocks to climb (glass ones are barely visible) |
| 電梯 Elevators, 移動平台 Shuttles, 旋轉平台 Spinning Bridges | platforms that carry you |
| 獨木橋 Tightropes, 針尖柱 Needle Pillars | narrow beams over a red floor, tiny pillar tops |
| 旋轉死亡棒 Sweeper | a red bar sweeping a disc: jump it |
| 消失地板 Crumbling Tiles | tiles that drop away soon after you land |
| 輸送帶 Conveyors, 冰面 Ice Rink | belts that push you off, ice that keeps you sliding |
| 彈跳墊 Launch Pads, 攀爬架 Truss Climb | pads that throw you up; a truss you climb by walking into it |
| 雷射走廊 Laser Hall, 掃蕩方塊 Crushers | lasers that switch on and off, red blocks sliding across your path |

Half the rounds come with a modifier: low gravity, speed up, high jump, slow, fog or heavy.

## Coins and the shop

Reaching the top earns coins (more for a faster climb). Spend them on a **Speed Coil**, a **Gravity Coil** (both switch on and off any
time) and outfit colours. **Practice mode** turns every stage into a checkpoint but earns nothing.

## Controls

| | |
|---|---|
| WASD / arrows | move (relative to the camera) |
| Space | jump |
| drag / mouse wheel | turn the camera / zoom |
| Shift | shift lock (the camera stays behind you) |
| R | reset |

**Controller** (any standard gamepad): left stick or D-pad move, A jump, right stick camera, LB / RB zoom, X shift lock, View reset,
Start shop (B closes it). On the title screen A starts; on the win screen A climbs a new tower and X climbs the same one again.

On a phone: the left half of the screen is a stick, drag the right half to look, and the yellow button jumps.

## Files

```
index.html, style.css
js/tower.js     the sections and how a tower is stacked (no DOM)
js/physics.js   the climber: walking, jumping, landing, being carried, pads, trusses, belts, ice, red bricks (no DOM)
js/build.js     meshes for the parts, the climber, the sky
js/audio.js     sound and music (Web Audio)
js/main.js      the game: camera, input, rounds, HUD, shop
tools/test.mjs  builds many towers, checks every jump is within reach, tests the physics, and lets a bot climb the sections
```

Run locally with any static server (`python -m http.server`), then open http://localhost:8000. `npm test` runs the checks.
