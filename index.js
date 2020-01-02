const babel = require('@babel/core');
const chalk = require('chalk');
const jsdoc = require('jsdoc-api');
const fs = require('fs');
const glob = require('glob');
const testRunnerCode = fs.readFileSync('./testRunner.js').toString();

const program = require('commander');

program.version('0.0.1');

program.option('-f, --files <glob>', 'Files to match');

program.parse(process.argv);

if (!program.files) {
	throw new Error('Files missing');
}

function customPrintTest(test) {
	test.split(/\r\n|\r|\n/g).forEach(line => console.log('    ' + chalk.green(line.trim())));
	console.log('');
}

glob(program.files, { ignore: '**/node_modules/**/*' }, async (error, files) => {
	if (error) {
		throw error;
	}

	const fileData = files.map(filePath => {
		const fileData = fs.readFileSync(filePath).toString();
		return {
			file: filePath,
			jsdoc: jsdoc.explainSync({ source: fileData }),
			fileData
		};
	});

	const tests = [];

	fileData.forEach(file => {
		file.jsdoc.forEach(comment => {
			console.log(require('util').inspect(comment, { colors: true, depth: null }));
			comment.tags &&
				comment.tags.forEach(tag => {
					if (tag.title != 'test') {
						return;
					}
					tests.push({
						name: comment.name,
						type: comment.kind,
						file: file.file,
						testCode: tag.value,
						fileData: file.fileData
					});
				});
		});
	});

	console.log(`Found ${tests.length} tests`);
	let success = 0;
	let failed = 0;
	let printedHeaders = [];
	await Promise.all(
		tests.map(async test => {
			const header = `${test.type}: ${test.name} in ${test.file}`;
			if (printedHeaders.indexOf(header) === -1) {
				console.log(chalk.green(header));
				printedHeaders.push(header);
			}

			console.log('Running:');
			customPrintTest(`${test.testCode}`);

			try {
				let code = `${testRunnerCode}
${test.fileData}

${test.testCode}
`;
				let transpiledCode = '';

				try {
					transpiledCode = await new Promise((resolve, reject) => {
						babel.transform(
							code,
							{
								babelrc: true,
								filename: '.babelrc'
							},
							(error, result) => {
								if (error) {
									return reject(error);
								}

								return resolve(result.code);
							}
						);
					});
				} catch (error) {
					throw new Error(`Failed to run test code: ${error.message}`);
				}

				eval(transpiledCode);

				success++;
			} catch (error) {
				failed++;
				console.log(chalk.red(require('util').inspect(error, { colors: true, depth: null })));
			}
		})
	);

	if (success) console.log(chalk.green(`Tests finished successfully: ${success}`));
	if (failed) console.log(chalk.red(`Tests failed: ${failed}`));
	process.exit();
});
