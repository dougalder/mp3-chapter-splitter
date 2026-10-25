#!/usr/bin/env python3
"""Generate MP3 test fixtures using ffmpeg"""
import subprocess
import os
import sys

def generate_tone(freq, duration, sample_rate=44100):
    """Generate sine wave tone"""
    samples = int(duration * sample_rate)
    import math
    pcm = []
    for i in range(samples):
        t = i / sample_rate
        val = int(32767 * 0.9 * math.sin(2 * math.pi * freq * t))
        pcm.append(val & 0xFFFF)
    return pcm

def run(cmd):
    """Execute shell command"""
    print(f"  {cmd}")
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"ERROR: {r.stderr}")
        sys.exit(1)

print("Generating MP3 fixtures...")
os.makedirs("fixtures", exist_ok=True)

# Album: 10 tones at specific timestamps with frequencies
# Total 2820s, freqs [262,294,330,349,392,440,494,523,587,659]
starts = [0, 250, 515, 852, 1160, 1504, 1803, 2048, 2252, 2575]
freqs = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659]

print("\n1. album.mp3 (10 tones, 2820s)")
# Use ffmpeg to generate tones
ffmpeg_filter = "".join([
    f"[tone{i}]" for i in range(10)
]) + f"concat=n=10:v=0:a=1[out]"

tone_inputs = []
for i, (start, freq) in enumerate(zip(starts, freqs)):
    duration = (starts[i+1] - start) if i+1 < len(starts) else (2820 - start)
    tone_inputs.append(f"sine=frequency={freq}:duration={duration}")

tone_chain = ";".join([f"{inp}[tone{i}]" for i, inp in enumerate(tone_inputs)])
run(f"ffmpeg -f lavfi -i '{tone_chain};{ffmpeg_filter}' -b:a 128k fixtures/album.mp3 -y 2>/dev/null")

# Studio: music, silence, music, silence, music, silence, music (337.5s total)
print("\n2. studio.mp3 (clean studio, 337.5s)")
run("ffmpeg -f lavfi -i 'sine=f=262:d=80;sine=f=330:d=2.5;sine=f=330:d=80;sine=f=2.5;sine=f=392:d=80;sine=f=2.5;sine=f=494:d=80:concat=n=7:v=0:a=1' -b:a 128k fixtures/studio.mp3 -y 2>/dev/null")

# Live: music with noise (applause)
print("\n3. live.mp3 (live with applause, 302s)")
run("ffmpeg -f lavfi -i 'sine=f=262:d=90;anoisesrc=d=8;sine=f=349:d=100;anoisesrc=d=9;sine=f=440:d=95:concat=n=5:v=0:a=1' -b:a 128k fixtures/live.mp3 -y 2>/dev/null")

# CBR, VBR, Mono variants
print("\n4. cbr.mp3 (constant bitrate)")
run("ffmpeg -f lavfi -i 'sine=f=440:d=60' -b:a 128k -q:a 0 fixtures/cbr.mp3 -y 2>/dev/null")

print("\n5. vbr.mp3 (variable bitrate)")
run("ffmpeg -f lavfi -i 'sine=f=440:d=60' -q:a 2 fixtures/vbr.mp3 -y 2>/dev/null")

print("\n6. mono22.mp3 (mono, 22050 Hz)")
run("ffmpeg -f lavfi -i 'sine=f=440:d=60' -ac 1 -ar 22050 -b:a 64k fixtures/mono22.mp3 -y 2>/dev/null")

print("\nFixtures ready in ./fixtures/")
