# serverless-cnf-builder
serverless-cnf-builder(이하 svlsbdr)는 AWS Lambda 기반의 Serverless 개발을 효율적으로 도와주는 3가지 기능이 있습니다.
1. [Serverless Framework](https://www.serverless.com/)에서 사용하는 [serverless.yml](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml) 파일을 템플릿을 기반으로 쉽게 만들어줍니다.
2. 각 함수의 미리 선언된 spec을 기반으로 자동으로 문서를 생성하여 export(Notion,OpenAPI 3.0)해줍니다.

## 설치
```
npm install serverless-cnf-builder -g
```


# severless.yml 생성
공통 리소스(기본 설정,IAM 역할, Cloudformation 기반 리소스 등)를 정의한 템플릿 파일을 기반으로 apiSpec이 정의된 함수가 포함된 새로운 serverles.yml 파일을 생성해줍니다.





# apiSpec 생성
각 Lambda 함수에  다음 형식으로 apiSpec을 선언하여 export 합니다. apiSpec은 [lambda-code-helper](https://github.com/spark323/lambda-helper)에서도 활용합니다.
```
const apiSpec = {
    "category": "test",
    "desc": "테스트 함수",
    event [

    ]   
};
exports.apiSpec = apiSpec;
exports.handler = async (event, context) => {

}

```
## event 
각 함수의 트리거 이벤트를 설정할 수 있습니다. 현재 사용 가능한 트리거는 다음과 같습니다.
- REST : api gateway에서 http형식
- websocket : api gateway의 websocket
- s3 : Amazon S3의 이벤트
- sqs : Amazon SQS 
- cognito: Amazon Cognito UserPool
- sfn : Amazon Stepfunction
- iot : AWS IOT
- pure : 별도로 트리거를 지정하지 않음

### Rest
```
const apiSpec = {
    "category": "test",    
    "event": [{
        "type": "REST",
        "method":"Get"
    }]
    ...      
};
```
* event.method : HTTP Method(Get,Put,Delete,Post...) 
* authorizer(optional): Serveless Template에서 정의한 Congito Authorizer Logical Id 

### websocket
```
const apiSpec = {
    "category": "test",
   
    "event":[
        {
            "type": "websocket",
            "route":"$connect"
        }
    ]
    ...  
};
```
event.route : API Gateway Websocket Route ([참조](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html))

### S3
```
const apiSpec = {
    "category": "test",
    "event": [
        {
            "type": "s3",
            "existing": true,
            "bucket": `my-test-bucket`,
            "event": "s3:ObjectCreated:put"
        },
        {
            "type": "s3",
            "existing": false,
            "bucket": `\${ssm:/\${self:app}/\${opt:stage, "dev"}/filebucket}`,
            "event": "s3:ObjectCreated:post"
        }
    ],
    ...  
};
```
([Serverless Framework s3 Event](https://www.serverless.com/framework/docs/providers/aws/events/s3) 참고)

* exisiting: 버킷이 이미 존재하는지 여부. false라면 serverless framwork에서 직접 S3 버킷을 생성
* bucket: 이미 존재하는 버킷 혹은 새로 생성할 버킷의 이름
* event: [S3 트리거 이벤트](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html#supported-notification-event-types)

### SQS
```
const apiSpec = {
    "category": "s3",
    "event": [
        {
            "type": "sqs",
            "sqsARN": `arn:aws:sqs:ap-northeast-2:207637378596:test-queue-1`,
        },
        {
            "type": "sqs",
            "sqs": `MySQSQueue`,
        }
    ]
    ...
}
```
([Serverless Framework SQS Event](https://www.serverless.com/framework/docs/providers/aws/events/sqs) 참고)

* sqsARN: 이미 존재하는 SQS를 사용할 경우 ARN 명시
* sqs: Serverless Template에서 정의한 SQS의 Logical ID



## serverless_template.yml
