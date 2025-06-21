#!/bin/bash

export NODE_OPTIONS=--max_old_space_size=7500

npm install -g serverless@3.38.0

exportVar="export AWS_ACCESS_KEY_ID=""$"$1_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY=""$"$1_SECRET_ACCESS_KEY""
eval "$exportVar"

deployCmd="APP_URL=""$"APP_URL_$1" SECRET_KEY_FOR_ENCRYPTION=""$"SECRET_KEY_FOR_ENCRYPTION" serverless deploy --region ""$"AWS_REGION" --stage $2"

eval "$deployCmd"
