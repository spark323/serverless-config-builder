#!/usr/bin/env node
const yargs = require("yargs");
var builder = require("./builder");
require('dotenv').config()
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_template.yml";

if (argv.n) {
    builder.uploadToNotion(argv.n, process.env.STAGE, process.env.VER);
}
else {
    (argv.x) ? builder.generateExportFile() : builder.generateServerlessFunction(`./${templateFile}`, argv.stage ? argv.stage : process.env.STAGE, argv.ver ? argv.ver : process.env.VER);
}


//console.log(graphql);
