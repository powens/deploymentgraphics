import fs from "fs";

import { makeDeploymentMap } from "./make-mission-card";

const fileName = "out/dawn_of_war.svg";
const stream = fs.createWriteStream(fileName);

stream.once("open", (fd) => {
  stream.end(makeDeploymentMap());
});
