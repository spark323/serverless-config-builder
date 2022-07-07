#!/usr/bin/env node
const yargs = require("yargs");

var builder = require("./builder");
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_template.yml";

if (argv.n) {
    builder.uploadToNotion(argv.n);
}
else {
    (argv.x) ? builder.generateExportFile() : builder.generateServerlessFunction(`./${templateFile}`);
}
//console.log(graphql);


