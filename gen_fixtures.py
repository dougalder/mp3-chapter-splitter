#!/usr/bin/env python3
"""Generate small test MP3s with ffmpeg: songs (tremolo sines at known pitches)
separated by silence (studio) or white noise (live). Usage: python3 gen_fixtures.py"""
import subprocess, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(OUT, exist_ok=True)

def song(freq, dur, ch=2):
    e = f"0.6*sin(2*PI*{freq}*t)*(0.6+0.4*sin(2*PI*0.7*t))"
    return f"aevalsrc=exprs={'|'.join([e]*ch)}:d={dur}:s=44100"

def silence(dur, ch=2):
    return f"anullsrc=r=44100:cl={'stereo' if ch == 2 else 'mono'}:d={dur}"

def crowd(dur, ch=2):
    return f"anoisesrc=d={dur}:c=white:a=0.25:r=44100,aformat=channel_layouts={'stereo' if ch == 2 else 'mono'}"

def make(name, parts, extra):
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in parts: cmd += ["-f", "lavfi", "-i", p]
    cmd += ["-filter_complex", "".join(f"[{i}:a]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[o]",
            "-map", "[o]"] + extra + [os.path.join(OUT, name)]
    subprocess.run(cmd, check=True)
    print("made", name)

F = [262, 330, 392, 494]; D = [30, 36, 28, 34]
studio = []
for i, (f, d) in enumerate(zip(F, D)):
    studio.append(song(f, d))
    if i < 3: studio.append(silence(2.5))
make("studio.mp3", studio, ["-b:a", "128k", "-ar", "44100"])                       # CBR + Xing
make("cbr-noxing.mp3", studio, ["-b:a", "128k", "-ar", "44100", "-write_xing", "0"])
make("vbr.mp3", studio, ["-q:a", "4", "-ar", "44100"])                              # VBR
live = []
for i, (f, d) in enumerate(zip(F[:3], [40, 45, 40])):
    live.append(song(f, d))
    if i < 2: live.append(crowd(7))
make("live.mp3", live, ["-b:a", "128k", "-ar", "44100"])
mono = [song(262, 20, 1), silence(2.5, 1), song(330, 20, 1)]
make("mono22.mp3", mono, ["-b:a", "48k", "-ar", "22050", "-ac", "1"])               # MPEG-2 Layer III

# demo.mp3: ~19 minutes, six "songs" of 3-4 minutes with varied dynamics, 3 s gaps (used for screenshots/long-file test)
D2 = [212, 187, 254, 168, 231, 196]; F2 = [262, 294, 330, 349, 392, 440]; R2 = [0.31, 0.5, 0.23, 0.7, 0.4, 0.6]
def demo_song(f, r, d):
    e = f"0.55*sin(2*PI*{f}*t)*(0.5+0.5*sin(2*PI*{r}*t))*(0.45+0.55*abs(sin(2*PI*0.012*t)))"
    return f"aevalsrc=exprs={e}|{e}:d={d}:s=44100"
demo = []
for i in range(6):
    demo.append(demo_song(F2[i], R2[i], D2[i]))
    if i < 5: demo.append(silence(3))
make("demo.mp3", demo, ["-b:a", "128k", "-ar", "44100"])
