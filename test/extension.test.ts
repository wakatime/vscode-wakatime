// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as myExtension from '../src/wakatime';

// Defines a Mocha test suite to group tests of similar kind together
suite("WakaTime Tests", () => {

	// Defines a Mocha unit test
	test("WakaTime", (done) => {
		let testController = new myExtension.WakaTime(null, null, null);

		vscode.workspace.openTextDocument(path.join(__dirname, '..', '..', 'package.json')).then((document) => {
			assert.equal(!!testController, true);
			done();
		}, (error) => {
			assert.fail(error);
			done();
		});
	});
});
