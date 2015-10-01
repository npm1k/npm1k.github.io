#!/bin/bash
set -e
git checkout master
git pull origin master
npm install
npm run generate
git add index.html
git commit --message=Regenerate
git push origin master
