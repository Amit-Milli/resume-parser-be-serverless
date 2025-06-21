# $1 is the name of stage to be deployed
# $2 is the name of function to be deployed

sls deploy  --stage $1  --aws-profile $1 --function $2  --region us-east-1
