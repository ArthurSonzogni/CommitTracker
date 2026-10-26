// Generate the badge artwork with the Gemini API (Nano Banana 2.1), one image
// per entry of prompts.json, in the style of a reference image.
//
// Usage: GEMINI_API_KEY=... node scripts/badge-art/generate.mjs [file-filter]
//
// Images go to scripts/badge-art/out/<file>.jpg. Existing ones are skipped:
// delete one to regenerate it. Then run optimize.sh.

import fs from "fs";
import path from "path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const out_dir = `${dir}/out`;
const reference = `${dir}/reference.jpg`;
const jobs = 4;

const filter = process.argv[2] ?? "";
const { style, badges } = JSON.parse(fs.readFileSync(`${dir}/prompts.json`, "utf8"));
const reference_data = fs.readFileSync(reference).toString("base64");

const Generate = async (badge) => {
  const accent = badge.accent == "none" ? "none, pure ivory on black" : badge.accent;
  const text = "Match the art style, border and color palette of the reference " +
    "image exactly; only the subject changes. " +
    `${style} Accent color: ${accent}. Subject: ${badge.subject}`;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-nano-banana-2.1",
      input: [
        { type: "text", text },
        { type: "image", mime_type: "image/jpeg", data: reference_data },
      ],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "1:1",
        image_size: "1K",
      },
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${json.error?.message}`);
  }
  const image = json.steps
    ?.filter(step => step.type == "model_output")
    .flatMap(step => step.content)
    .find(content => content.type == "image");
  if (!image) {
    throw new Error("No image in the response");
  }
  fs.writeFileSync(`${out_dir}/${badge.file}.jpg`, Buffer.from(image.data, "base64"));
};

const queue = badges.filter(badge =>
  badge.file.includes(filter) &&
  !fs.existsSync(`${out_dir}/${badge.file}.jpg`) &&
  !fs.existsSync(`${out_dir}/${badge.file}.png`));
console.log(`${queue.length} images to generate`);

let failures = 0;
const Worker = async () => {
  while (queue.length) {
    const badge = queue.shift();
    // Retry once, on transient errors.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await Generate(badge);
        console.log(`ok ${badge.file}`);
        break;
      } catch (error) {
        console.log(`!! ${badge.file} (attempt ${attempt}): ${error.message}`);
        if (attempt == 2) {
          failures++;
        }
      }
    }
  }
};
await Promise.all(Array.from({ length: jobs }, Worker));
console.log(`done, ${failures} failures`);
