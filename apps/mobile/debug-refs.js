const ts = require('typescript');

const configPath =
  ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.app.json') ||
  ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
console.log('Config:', configPath);
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, './');

const program = ts.createProgram(parsed.fileNames, parsed.options);
const sourceFiles = program.getSourceFiles();

for (const sf of sourceFiles) {
  if (sf.referencedFiles && sf.referencedFiles.length > 0) {
    console.log(sf.fileName, 'has', sf.referencedFiles.length, 'refs');
    sf.referencedFiles.forEach((ref, i) => {
      if (!ref) {
        console.log('  UNDEFINED ref at index', i, 'in', sf.fileName);
      }
    });
  }
}
console.log('Total files checked:', sourceFiles.length);

// Also try to get diagnostics to see what triggers the error
try {
  const diags = ts.getPreEmitDiagnostics(program);
  console.log('Diagnostics count:', diags.length);
} catch (e) {
  console.error('Error getting diagnostics:', e.message);
  console.error('Stack:', e.stack);
}
