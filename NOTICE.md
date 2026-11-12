# Copyright, licence and additional terms

**Chaos CathodeRay**
Copyright © 2026 Jonathan O'Hear

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is also subject to the additional permissions and terms below, which are given under Section 7 of that licence.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program in the file [LICENSE](./LICENSE). If not, see <https://www.gnu.org/licenses/>.

Source code: <https://github.com/johear/Chaos-CathodeRay>

---

## Additional permissions (Section 7)

The copyright holder grants these permissions in addition to the GNU Affero General Public License. Section 7 allows anyone who conveys a modified version of the Program to remove them from that version.

### Permission 1: your shows, media and output are yours

Some things are not covered works merely because they were created, edited, stored or played with the Program:
- show files (`.chaos.json`, `.chaospack.json` and earlier formats);
- cue lists, venue, rig and calibration data;
- media you import;
- anything the Program renders or outputs: images, video, light, DMX, Art-Net, OSC and MIDI data, and recordings.

This applies even where the Program embeds copies of its own built-in presets, shader code or default data in them so that they play back. You may license them however you choose.

### Permission 2: plugins and external tools

A **Plugin** interacts with the Program only through its documented public interfaces:
- the plugin, shader, device-profile and show file formats;
- the `ChaosCathodeRayAPI` JavaScript interface;
- the OSC, Art-Net, DMX, MIDI and bridge (HTTP/WebSocket) protocols.

A Plugin can be:
- a shader, effect, generator, modulator or device profile, including `.chaosplugin.json`, ISF `.fs`/`.isf` and `.wmdevice.json` files;
- another extension;
- a separate program.

You may create and distribute Plugins under terms of your choice, including proprietary terms. The Program may load and run them without the Plugin becoming a covered work. This permission does not extend to a modified version of the Program itself, which remains under the GNU Affero General Public License.

## Additional terms (Section 7)

### Term 1: attribution (Section 7(b))

Every covered work must preserve, in its *Appropriate Legal Notices* (as defined in Section 0 of the GNU Affero General Public License):
- the copyright notice **"Copyright © 2026 Jonathan O'Hear"**;
- the author attribution **"Based on Chaos CathodeRay (https://github.com/johear/Chaos-CathodeRay)"**.

### Term 2: trademarks (Section 7(e))

This licence grants no rights under trademark law to the name "Chaos CathodeRay", its logos or other brand features. See [TRADEMARK.md](./TRADEMARK.md).
