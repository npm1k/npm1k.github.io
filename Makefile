all:
	-echo Installing devDependencies
	npm install
	-echo Adding npm1k to dependencies
	node bin/add-dependencies.js < package.json > temporary.json
	mv temporary.json package.json
	-echo Installing npm1k
	npm install --ignore-scripts
	du -hcs node_modules
	-echo Generating the site
	npm run generate
	-echo Reverting package.json
	git checkout package.json
