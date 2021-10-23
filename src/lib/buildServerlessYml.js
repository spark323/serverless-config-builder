#!/usr/bin/env node
const yargs = require("yargs");

var devOpsUtil = require("./devOpsUtil");
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

let templateFile = (argv.t) ? argv.t : "serverless_template.yml";
let stage = (argv.stage) ? argv.stage : "dev";
//console.log("templateFile:", templateFile);
process.env.stage = stage

let graphql = (argv.g);

//console.log(graphql);
if (graphql) {
    devOpsUtil.generateGraphQL();
} else {
    devOpsUtil.generateServerlessFunction(`./${templateFile}`, stage);
}