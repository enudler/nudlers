# Directory Rename Instructions

## Steps to Complete the Rename

All file contents have been updated to use "nudlers". Now you just need to rename the directory itself.

### 1. Stop the Dev Server
Press `Ctrl+C` in the terminal where `npm run dev` is running.

### 2. Rename the Directory
Open a new terminal and run:
```bash
cd /Users/elinudler/Git
mv clarify-expences nudlers
```

### 3. Restart the Dev Server
```bash
cd /Users/elinudler/nudlers/app
npm run dev
```

### 4. Update Your IDE/Editor
If you have the project open in VS Code or another editor, close it and reopen the project from the new location:
```
/Users/elinudler/Git/nudlers
```

That's it! Your project will be fully renamed to "nudlers".
