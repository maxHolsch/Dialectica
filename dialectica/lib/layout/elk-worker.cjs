// Spawned as a child process by elkAdapter via child_process.execFile().
// Reads the ELK graph from stdin as JSON, runs layout, writes result to stdout.
// Plain require() so Next.js's bundler never touches this file.
const ELK = require("elkjs/lib/elk.bundled.js");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const graph = JSON.parse(input);
  const elk = new ELK();
  elk
    .layout(graph)
    .then((result) => {
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(String(err));
      process.exit(1);
    });
});
