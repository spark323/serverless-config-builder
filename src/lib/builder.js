const yaml = require('js-yaml');
const fs = require('fs');
const fspr = require('fs').promises;
var path = require('path')


function replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}
function replaceHttpMethod(_str) {
    let str = _str.replace("/post", "");
    str = str.replace("/get", "");
    str = str.replace("/put", "");
    str = str.replace("/delete", "");
    return str;
}
/*
경로를 iterate하면서 모든 파일 목록을 생성한다.
*/
async function getFunctionList(dir, arr) {
    const result = await fspr.readdir(dir);
    let prom = result.map(async (file) => {
        file = path.resolve(dir, file);
        const element = await fspr.stat(file);
        if (element.isDirectory()) {
            const newar = await getFunctionList(file, arr);
            arr.concat(newar);
        }
        else {
            arr.push({ path: file })
        }
    })
    await Promise.all(prom);
    return arr;
}

/*
svlsbdr의 진입점
*/
async function generateServerlessFunction(templateFile) {
    //먼저 src/lambda 이하의 파일을 파싱해 apiSpec들을 가져와서
    const apiSpecList = await getApiSepcList();
    //serverless.yml로 프린트한다.
    await printServerlessFunction(templateFile, apiSpecList);
}


/*

serverless.yml 파일에 쓰기 전에 람다 함수의 목록을 작성한다.
*/
async function getApiSepcList() {
    //[todo1: 소스파일 경로 지정할 수 있도록 변경]
    let files = await getFunctionList("./src/lambda", []);
    let apiSpecList = { "nomatch": [], "error": [] };
    files.forEach((fileItem) => {
        const path = fileItem.path;
        try {


            //serverless.yml에서 사용될 함수의 이름을 자동으로 지정한다. 이름은 src/lambda를 제외한 경로를 _ 로 나누어서 만든다
            //예: src/lambda/build/test/get.js = build_test_get
            //[todo2]Path Parsing 최적화
            let name = "";
            name = path.replace(".js", "");
            name = replaceAll(name, "\\\\", "/");
            let nameArr = name.split("/");
            const idxLambda = nameArr.indexOf("lambda");
            nameArr = nameArr.slice(idxLambda - 1);
            name = nameArr.slice(2).join("/");
            try {
                file = fs.readFileSync(path);
            }
            catch (e) {
                console.error(e);
            }
            try {
                let obj = require(path).apiSpec;
                if (obj) {
                    obj["name"] = name;
                    obj["uri"] = replaceHttpMethod(name);
                    //추후 문서화를 대비해서 카테고리 별로 정렬
                    if (!apiSpecList[obj.category]) {
                        apiSpecList[obj.category] = [];
                    }
                    apiSpecList[obj.category].push({ path: path, item: obj })
                }
            } catch (e) {
                console.log("Error parsing ", path)
                apiSpecList["error"].push({ path: path, obj: "error" })
                console.error(e);
            }
        }
        catch (e) {
            console.log("Error parsing ", path)
            apiSpecList["error"].push({ path: path, obj: "error" })
            console.error(e);
        }
    });
    return apiSpecList;
}

//[todo4: 포스트맨에 Export 기능 추가하기]
function createPostmanImport(apiSpecList, title, stage, _version, host) {
    const projectInfo = yaml.load(fs.readFileSync('./info.yml', "utf8"));
    const description = projectInfo.description;
    const contact = projectInfo.contact;
    const version = `${stage}-${_version}`;
    const servers = [{ url: host }];
    const schemes = ["https"];
    let paths = {};
    //경로에 따라 정렬
    const obj = sortApiSpecListByPath(apiSpecList);
    //console.log(obj);
    for (var property in obj) {
        paths[property] = {};
        for (var method in obj[property]) {
            const api = obj[property][method];
            paths[property][method] = {};
            paths[property][method].descroption = api.desc;
            if (!api.noAuth) {
                paths[property][method].security =
                    [{
                        bearerAuth: ["test"]
                    }]
            }
            paths[property][method].parameters = [];
            if (method == "get" || method == "delete") {
                for (var parmName in api.parameters) {
                    const parm = api.parameters[parmName];

                    paths[property][method].parameters.push(
                        {
                            name: parmName,
                            in: "query",
                            description: parm.desc,
                            required: parm.req,
                            schema: { type: parm.type.toLowerCase() }
                        }
                    )

                }
            }
            if (method == "post" || method == "put") {
                let requireds = [];
                let proprs = {};
                for (var parmName in api.parameters) {
                    const parm = api.parameters[parmName];
                    if (parm.req) {
                        requireds.push(parmName);
                    }
                    proprs[parmName] = {
                        type: parm.type
                    }
                }
                paths[property][method].requestBody = {
                    required: true,
                    content: {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": requireds,
                                "properties": proprs,
                            }
                        }
                    }
                }

            }

        }
    }
    const all = {
        "openapi": "3.0.0",
        info: {

            version: version,
            title: `${title}(${stage})`,
            description: description,
            contact: contact,

        },
        servers: servers,
        paths: paths,
        components: {
            securitySchemes:
            {
                bearerAuth:
                {
                    type: "http",
                    scheme: "bearer"
                }
            }
        }
    }
    return (JSON.stringify(all));
}
function sortApiSpecListByPath(apiSpecList) {
    let obj = {};
    for (var category in apiSpecList) {
        const prop = apiSpecList[category];
        prop.forEach((itemt) => {
            const item = itemt.item;
            if (!item || !item.type || item.hide || !item.method) {
                return;
            }
            if (!obj[item.uri]) {
                obj[item.uri] = [];
            }
            obj[item.uri][item.method.toLowerCase()] = item;
        })
    }
    return obj;
}
/*
가져온 apiSpec 리스트를 기반으로 serverless.yml파일을 만든다.
*/
async function printServerlessFunction(templateFile, apiSpecList) {
    //템플릿 파일을 읽는다.
    let serverlessTemplet1 = yaml.load(fs.readFileSync(templateFile, "utf8"))
    let functions = {};
    //만들어둔 apiSpecList를 활용해서 
    for (var property in apiSpecList) {

        //apiSpecList는 카테고리 를 Key로 하여 구성되어 있다.
        let apiSpec = apiSpecList[property];
        if (apiSpec.length > 0) {
            //각 카테고리 별로..
            apiSpec.forEach(async (obj) => {
                const item = obj.item;
                //item의 method가 존재하고  disabled가 아니라면, 
                if (item && (item.method) && (!item.disabled)) {
                    const nameArr = item.name.split("/");
                    let funcObject = {
                        name: item.functionName ? item.functionName : (`\${self:app}_\${opt:stage, "dev"}\${opt:ver, "1"}_${nameArr.join("_")}`),
                        handler: `src/lambda/${item.name}.handler`,
                        events: [],
                    };
                    //[todo1: 소스파일 경로 지정할 수 있도록 변경]
                    //웹소켓 타입
                    if (item.type == "websocket") {
                        funcObject.events.push({
                            websocket: {
                                route: `${item.route}`,
                            }
                        })
                    }
                    //s3에 의해 트리거 되는 함수
                    else if (item.type == "s3") {
                        funcObject.events.push({
                            s3: {
                                bucket: `${item.event.bucket}`, event: item.event.event,
                                existing: (item.event.existing) ? item.event.existing : false
                            }
                        })
                    }
                    //sqs에 의해 트리거 되는 함수
                    else if (item.type == "sqs") {

                        //sqs arn을 명시할 경우, 즉 이 serverless에서 SQS를 생성하는 것이 아닐 경우,
                        if (item.sqsARN) {
                            funcObject["events"].push({
                                sqs: { arn: item.sqsARN }
                            })
                        }
                        //이 serverless에서 sqs를 생성하는 경우
                        else {
                            funcObject["events"].push({
                                sqs: { arn: { "Fn::GetAtt": [item.sqs, "Arn"] } }
                            })
                        }
                    }
                    //어느 이벤트에도 트리거되지 않는 함수
                    else if (item.type == "pure") {

                    }
                    //별도의 명시가 없다면 모두 HTTP
                    else {
                        funcObject.events.push(
                            {
                                http: {
                                    path: `${item.uri}`,
                                    method: `${item.method.toLowerCase()}`,
                                    cors: true,
                                }
                            }
                        )
                    }
                    //레이어가 존재한다면 레이어 추가
                    if (item.layer) {
                        funcObject["layers"] = [item.layer]
                    }
                    //타임아웃이 존재한다면, 타임아웃 추가
                    if (item.timeout) {
                        funcObject["timeout"] = parseInt(item.timeout);
                    }
                    functions[`${nameArr.join("_")}`] = funcObject;
                }
            });
        }
    }
    serverlessTemplet1.functions = functions;
    //serverless.yml파일을 쓴다.
    let yamlStr = yaml.dump(serverlessTemplet1);
    fs.writeFileSync(`serverless.yml`, yamlStr, 'utf8');
}
module.exports.generateServerlessFunction = generateServerlessFunction;

