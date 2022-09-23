#!/usr/bin/env node
const yargs = require("yargs");
const { exec } = require('child_process');
var builder = require("./builder");
require('dotenv').config()
const { hideBin } = require('yargs/helpers');
const { makeConsoleLogger } = require("@notionhq/client/build/src/logging");
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_template.yml";

if (argv.n) {
    builder.uploadToNotion(argv.n);
}
else {
    (argv.x) ? builder.generateExportFile() : builder.generateServerlessFunction(`./${templateFile}`,process.env.STAGE?process.env.STAGE:argv.stage,process.env.VER?process.env.VER:argv.ver);
}


//console.log(graphql);
