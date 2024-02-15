import yaml from "js-yaml";
import fs from "fs";

// Get document, or throw exception on error
try {
  const doc = yaml.load(fs.readFileSync("/home/ixti/example.yml", "utf8"));
  console.log(doc);
} catch (e) {
  console.log(e);
}
