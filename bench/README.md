# LocalMind benchmark

`npm run bench` measures **time to first token** and **tokens per second** in a
real browser against the production build. The purpose is narrow: tell someone
whether their device will be usable before they download half a gigabyte.

## Run it

```bash
npm run bench                 # built-in rule engine, 3 runs
npm run bench -- --runs 5     # more samples, medians are reported
npm run bench -- --headful    # watch it happen
```

To measure a model instead, download it in the app first, then pass its id:

```bash
npm run bench -- --model Qwen2.5-0.5B-Instruct-q4f32_1-MLC
```

The script refuses to download anything: a benchmark that includes a download
measures the network, not the device.

## What the numbers mean

| Field               | Where it comes from                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Time to first token | `MessageStats.ttftMs`, measured from the send click to the first painted character         |
| Tokens per second   | `MessageStats.tokensPerSecond`                                                             |
| `estimatedTokens`   | `true` when the runtime reported no `usage`, so tokens were estimated at 4 characters each |

The median of the runs is reported rather than the mean, because one slow run
(a garbage collection, a background tab waking up) would otherwise define the
result.

## Reproducing a result

The report records the user agent, core count, reported memory, and whether
WebGPU is exposed, because those are the variables that matter:

```bash
node scripts/bench.mjs --runs 5 --out bench/results/mine.json
```

Results are written to `bench/results/` and are **not** committed: they describe
one machine. Attach the JSON to an issue or a discussion instead, with the device
name, and it becomes a data point for the next person asking "will this run on my
laptop".

## Reading the numbers honestly

- **The built-in engine is not a model.** Its throughput is a measure of the app's
  own pipeline (rendering, storage, paint) and a floor for responsiveness, not of
  any neural model.
- **Token counts may be estimates.** Only a runtime that reports `usage` gives true
  counts; the built-in engine cannot, and the report says so.
- **One tab, nothing else running.** A browser with thirty tabs open will report
  different numbers, and that is a real result, not a broken benchmark.
- **WebGPU presence is not WebGPU performance.** The script reports whether the API
  is exposed; it cannot tell you which adapter you have. Settings → Diagnostics
  shows the adapter when the browser exposes it.

## Adding a prompt

Edit `PROMPTS` in `scripts/bench.mjs`. Keep prompts comparable in length across
runs: time to first token depends on prompt processing, so a longer prompt with
the same model is slower for a real reason.
