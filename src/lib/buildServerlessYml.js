#!/usr/bin/env node
const yargs = require("yargs");

var devOpsUtil = require("./devOpsUtil");
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_temp1.yml";
console.log("templateFile:", templateFile);
devOpsUtil.generateServerlessFunction(`./${templateFile}`);
