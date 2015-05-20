all:
	npm install
	node bin/add-dependencies.js < package.json > temporary.json
	mv temporary.json package.json
	npm install
	npm run generate
	git checkout package.json
