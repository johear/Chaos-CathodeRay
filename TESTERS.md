# Beta tester guide: Chaos CathodeRay 0.1.0

Thank you for testing! Chaos CathodeRay is a projection-mapping and show-control app that runs as a single web page. This beta has one goal: find what is **confusing, broken or slow** before it goes to everyone. Every report helps, even "I didn't understand this button".

**▶ [Open Chaos CathodeRay](https://www.jonathan.ohear.com/Chaos/CathodeRay/Chaos-CathodeRay.html)**. You can also download `Chaos-CathodeRay.html` and double-click it; it works offline.

---

## 1. Start in two minutes

1. Use **Chrome or Edge on a desktop or laptop**. Firefox and Safari work for mapping, but not for multi-screen output, MIDI or USB-DMX.
2. The **Start screen** asks *What are you making?* Pick the card closest to your idea, or choose **Explore the demo show** or **Open a show file**:
   - **Quick 2D map:** a wall, a window or a box.
   - **Theatre play:** a set, a performer and a followspot.
   - **VJ set / club:** live mixing.
   - **Rehearsal:** keep what worked during a run-through.
   - **Architectural mapping:** a building facade.
3. Follow the hint that appears at the bottom of the screen.

## 2. The three rooms (F1 · F2 · F3)

| | Room | What it's for |
|---|---|---|
| **F1** | **BUILD** | The real space: venue, stage, set parts, screens, projectors and people. |
| **F2** | **MAP** | Put light onto things: drop media, drag corners onto objects, add FX, store cues. |
| **F3** | **LIVE** | Run the show: **GO** through cues, mix, run followspots. |

**GO only exists in LIVE.** If you switch from LIVE to MAP during a show, your edits are **Blind**: the audience keeps seeing the old look until you press **TAKE**, which fades your changes in.

## 3. Finding your way

- **The view bar** is the same in every 3D view:
  - **▦ Plan**, **⟲ 3D**, **🚶 Walk** and **📽 POV** (look through a projector);
  - six sides, **Top … Right**;
  - **✎ Lines / ☀ Light**. Lines gives a measured drawing; Light gives the rendered result.
- **Search anything:** press **/** (or ⌘K / Ctrl+K) and type what you're looking for, e.g. "shutter", "blackout" or "calibrate".
- **All shortcuts:** press **?**.
- **The ✓ / ⚠ chip** in the top right is the **Show Check**. It lists what would go wrong in front of an audience (dark stage, missing media, unsaved changes…), each with a **Fix** button.

## 4. Your work, and starting fresh

- Your work is **autosaved in your own browser**, on your computer only. Other testers never see it.
- When you come back, a **Welcome back** bar offers **Keep working** or **⟲ Start fresh**.
- To start over at any time, use **Show ▾ → ⟲ Start fresh…**. It offers a backup download first.
- **On a shared or demo computer**, add **`?fresh`** to the link (`…/Chaos-CathodeRay.html?fresh`). The app then opens clean, without restoring the last session.
- To keep a show:
  - **Show ▾ → Save Show** writes a `.chaos.json` file. Media stays where it is on disk.
  - **Pack Show** embeds the media, so you can move the show to another computer.

## 5. Projector output

1. Connect a projector or a second screen.
2. Press **Proj** on the right-hand rail and allow pop-ups if the browser asks.
3. In the projector window, press **F** for full screen.
4. When everything is aligned, press **Shift + P** to lock the show.

You don't need a projector to test: the **3D Venue** view shows what each projector would put on stage.

## 6. Reporting a problem (the most useful thing you can do)

1. Click the **β 0.1** badge (top left), or use **Show ▾ → 🐞 Report a problem**.
2. In **What happened?**, write what you did, what you expected and what happened instead.
3. Press **✉ Send**. You'll see **"✓ Sent as Chaos CathodeRay Report 261112-1415"**. Mention that number if we follow up.

- **If you're offline or Send fails,** use **✉ Email instead**, **📋 Copy report** or **⬇ Download .txt**, and send it to **talk.to.chaos.productions@gmail.com**.
- **Privacy:** the report contains your browser, screen and graphics card, the app's state and recent errors. It includes **counts only, no file names or media**, and nothing is sent until you press Send.
- **Confusion counts too.** "I couldn't find how to…" is just as valuable as a crash.

## 7. What to try

Pick whichever matches your work; even ten minutes helps.

**Quick 2D map**
- [ ] Start from *Quick 2D map*, drop a video or image onto the stage, and drag the four corners onto a real object (or a box on your desk).
- [ ] Add a second surface. Try a mask and the framing shutters.
- [ ] Save the show, reload the page, and check that everything comes back.

**Theatre play**
- [ ] Start from *Theatre play*. In BUILD, move the performer, add a platform or steps (**+Part**), and check the set in **Front** and **Plan** views.
- [ ] In MAP, store two or three cues. In LIVE, press **GO** and step through them.
- [ ] Pick up the followspot (**F** or **PICK UP**). Steer it, send it to a mark, and use **🗺 Plot**.
- [ ] Go from LIVE to MAP, change something, and check that the stage stays the same until you press **TAKE**.

**VJ set / club**
- [ ] Start from *VJ set / club*. Add a few sources and mix them on the **radar** (drag, flick, double-click to solo).
- [ ] Try audio-reactive modulation: right-click any slider.
- [ ] If you have one, try MIDI Learn (⌘M / Ctrl+M).

**Rehearsal**
- [ ] During a run in LIVE, press **📌 Keep** to store the current look, then refine it later in MAP.

**Architectural mapping**
- [ ] Start from *Architectural mapping*. Look at the facade in **Front · Lines**, select a face and choose **Map onto** it.
- [ ] Try **📐 Align by points**: click 4–8 known corners in 3D. Then switch to **POV** for that projector and **drag each crosshair** onto the real corner, or nudge with the arrow keys.
- [ ] In **Front · Lines**, click an underlined size (width, height, height above the floor, projector height) and **type an exact value**.
- [ ] With two projectors and multi-projector output on, **Map onto** a facade face. Each projector gets its own exactly fitted part.

**Everyone**
- [ ] Is the **Show Check** right? Do its **Fix** buttons fix the problem?
- [ ] Is anything slow? The FPS badge at the bottom right shows the frame rate; click it for **Fast** quality.
- [ ] Is any label, button or message unclear? Tell us which one.

## 8. Known limitations in 0.1

- On battery, Chrome's Energy Saver limits pages to **30 fps**. The FPS badge then shows **FPS CAP** (quality stays at 100%). For shows, plug in the power, or turn Energy Saver off (Chrome Settings → Performance).
- While **Blind**, generators and effects are held on stage, including their speed and pause. Playing, pausing or seeking a **video** still affects the stage immediately.
- Typing sizes on dimensions works in BUILD and MAP, not in LIVE or under Show Lock.
- When a set part is mapped through several projectors, the **3D Venue** view shows each projector's part in every projector's light. The real projector windows are correct; only this preview overlaps.
- The editable top **Plan** in BUILD is still a separate 2D drawing from the 3D views.
- When you open a show on another computer, its media must be relinked. Use **Pack Show** to avoid this.
- **Send** needs an internet connection. Offline, use Email instead, Copy or Download.

## 9. Keyboard essentials

| Action | Keys |
|---|---|
| Switch room | **F1** / **F2** / **F3** |
| Search any tool | **/** or **⌘K / Ctrl+K** |
| All shortcuts | **?** |
| GO / back (LIVE) | **Space** / **Shift+Space** |
| Blackout · restore | **B** · hold **B** or **Shift+B** |
| Lock the show | **Shift+P** |
| Pick up / fade out the active followspot | **F** (LIVE) |
| Steer the followspot | **`** |
| Nudge (1 px · 10 px · 0.2 px) | **Arrows** · **Shift+Arrows** · **Alt+Arrows** |
| Undo / redo | **⌘Z / Ctrl+Z** · **⇧⌘Z / Ctrl+Shift+Z** |

---

Thank you for helping. Questions or ideas that aren't bugs are welcome too: **talk.to.chaos.productions@gmail.com**.

*Chaos CathodeRay is free software (AGPL-3.0-or-later) and comes with no warranty. See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).*
