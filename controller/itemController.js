const dotenv=require("dotenv");
dotenv.config();
const{v4:uuidv4}=require("uuid");
const{DynamoDBClient}=require("@aws-sdk/client-dynamodb");
const {
    PutCommand,
    DeleteCommand,
    ScanCommand,
  } = require("@aws-sdk/lib-dynamodb");

  const docClient = new DynamoDBClient({ regions: process.env.AWS_REGION });
  
exports.getAssignmentStatus=async (req,res)=>{
    const params={
        TableName: process.env. //need to be fixed

    };
    try{
        const data=await docClient.send(new ScanCommand(params));
        res.send(data.Items);
    }
    catch(err){
        console.error(err);
        res.status(500).send(err);
    }
}

