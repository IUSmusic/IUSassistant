# I/US Music Assistant Songwriter

Official web preview:

- Captures notes from:
  - the on-screen keyboard
  - your computer keyboard
  - a connected MIDI device in supported browsers
- Lets you choose:
  - root note
  - scale
  - style preset
  - engine selection
  - step length (4, 3, or 1.5 beats)
  - chord loop
  - continuation length
- Generates a continuation using either:
  - a theory-guided rule engine
  - Magenta.js MusicVAE model selection
- Plays the phrase in-browser with SoundFont-backed playback when available
- Exports the result as a real `.mid` file

Implemented now:

- browser audio playback
- SoundFont-backed playback with browser fallback synth
- on-screen keyboard and computer keyboard note entry
- MIDI input connection in supported browsers
- theory-guided continuation based on scale, style, chord loop, and step length
- Magenta.js / MusicVAE model selection
- MIDI export
- static hosting compatibility for GitHub Pages and Netlify

- Preview stack: browser audio + MIDI input + theory-guided continuation.
- GitHub deploy path: static hosting on GitHub Pages or Netlify.


## Notes

- Web MIDI works best in Chrome / Edge.
- Audio starts only after user interaction, which is normal for browsers.
- The MusicVAE models are loaded from Magenta CDN on demand.
- If SoundFont loading is blocked or slow, the app falls back to a browser synth automatically.

## Brand

**I/US Music Assistant Songwriter**


# I/US Source-Available License 1.0

Copyright (c) 2026 Pezhman Farhangi  
I/US Music

This repository and its contents are made available for viewing, reference, study, and limited private internal evaluation only.

## Permitted use

You may:

- view the source code and documentation
- download the repository for personal reference, study, and internal evaluation
- make private modifications for personal, non-commercial evaluation only

## Restrictions

You may not, without prior written permission from IUS Music:

- sell this software or any modified version of it
- distribute, sublicense, publish, or share this software or any modified version of it outside the limited permissions required for access through GitHub
- use this software or any modified version of it for commercial purposes
- create or distribute derivative works for public or commercial release
- offer this software as part of a product, service, platform, device, or commercial package
- redistribute source code, compiled builds, packaged versions, or modified copies
- remove or alter copyright, ownership, or license notices

## GitHub platform notice

If this repository is hosted publicly on GitHub, GitHub users may have certain limited rights to view and fork the repository through GitHub’s own platform functionality, as required by GitHub’s Terms of Service. No permission is granted beyond those minimum platform rights unless explicit written permission is given by IUS Music.

## Ownership

All rights not expressly granted under this license are reserved.

This license does not transfer ownership of the software, documentation, designs, concepts, hardware direction, brand identity, or any related intellectual property.

## No trademark rights

This license does not grant any right to use the names I/US, IUS, I/US Music, the official logo, the visual identity, artwork, images, audio branding, or any other protected brand assets.

Trademark and brand use are governed separately.

## No warranty

This software and Hardware prototype and all associated materials are provided "as is", without warranty of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, and noninfringement.

In no event shall the author or copyright holder be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

## Contact

For licensing requests, commercial rights, redistribution requests, or permission to use protected brand assets, written permission must be obtained from I/US Music.
