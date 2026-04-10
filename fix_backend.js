const fs = require('fs');
const glob = require('glob');
const path = require('path');

const files = glob.sync('../nxt1-backend/**/*.js', {
  ignore: ['../nxt1-backend/node_modules/**', '../nxt1-backend/frontend-package.json'],
});

files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace queries
  if (content.includes('.where("isRecruit", "==", true)')) {
    content = content.replace(
      /\.where\("isRecruit", "==", true\)/g,
      '.where("role", "==", "athlete")'
    );
    changed = true;
  }
  if (content.includes('.where("isCollegeCoach", "==", true)')) {
    content = content.replace(
      /\.where\("isCollegeCoach", "==", true\)/g,
      '.where("role", "in", ["coach", "college-coach"])'
    );
    changed = true;
  }
  if (content.includes('.where("isMedia", "==", true)')) {
    content = content.replace(/\.where\("isMedia", "==", true\)/g, '.where("role", "==", "media")');
    changed = true;
  }
  // Add other flags as needed
  if (content.includes('.where("isRecruit", "in", [true, false])')) {
    content = content.replace(/\.where\("isRecruit", "in", \[true, false\]\)/g, ''); // Or handle appropriately
    changed = true; // Wait actually let's skip gmail controller manually since it's just for retrieving all users
  }

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
