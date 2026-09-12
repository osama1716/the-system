# Timer sounds

Every file here is **CC0 / public domain** (Creative Commons Zero). CC0 is a
dedication to the public domain: copy, modify, distribute and perform, for any
purpose including commercial, with no attribution required and no permission
asked. This file exists anyway — because knowing where an asset came from is
the only way anyone can check the claim later, including me.

Each is the compressed MP3 version of the original upload (the originals are
5-8 MB WAVs, which is not a thing to put in a web app). CC0 covers derivatives
too, so the compressed copy is as free as the source.

MP3 rather than the smaller OGG for one reason: Safari has no Vorbis decoder in
Web Audio, so every OGG here failed to decode on an iPhone - silently, because
the five with a synthesised stand-in fell back to it and the two without just
played nothing.

| File | Sound | Source | Author | License |
|---|---|---|---|---|
| `rain.mp3` | Soft Rain Loop | [freesound.org/s/595717](https://freesound.org/people/_lynks/sounds/595717/) | _lynks | CC0 |
| `fire.mp3` | Crackling Flames (loop) | [freesound.org/s/813328](https://freesound.org/people/NickTayloe/sounds/813328/) | NickTayloe | CC0 |
| `ocean.mp3` | Gentle Ocean Waves Loop | [freesound.org/s/852826](https://freesound.org/people/kkenny101/sounds/852826/) | kkenny101 | CC0 |
| `water.mp3` | seamless stereo creek loop 02 | [freesound.org/s/678268](https://freesound.org/people/msx2plus/sounds/678268/) | msx2plus | CC0 |
| `storm.mp3` | CycloneWindLoop | [freesound.org/s/472191](https://freesound.org/people/Kragnour/sounds/472191/) | Kragnour | CC0 |
| `forest.mp3` | Forest birds — ambient seamless loop | [freesound.org/s/723913](https://freesound.org/people/Magnesus/sounds/723913/) | Magnesus | CC0 |
| `cafe.mp3` | Cafe_crowd | [freesound.org/s/387333](https://freesound.org/people/tec_studio/sounds/387333/) | tec_studio | CC0 |

## Anything added later

Two rules, and they are not negotiable:

1. **CC0 only.** Not "free to download", not "royalty free", not CC-BY. This
   app is a public repository — the file itself is redistributed by being here,
   and most "free" licences allow the *use* while forbidding exactly that.
2. **The source link goes in the table above**, so the licence can be checked
   against the page rather than taken on trust.

Nothing here came from another app's assets, and nothing ever should.

## How they are loaded

Fetched on demand, not shipped with the first page load — see `FILE_SOUNDS` in
`js/sound.js`. Choosing a sound downloads it once; the service worker then has
it cached, so it works offline from then on. A sound whose file has not arrived
falls back to the synthesised version rather than playing silence.
