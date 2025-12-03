# Update the fix_imports.sh script with the correct paths
#!/bin/bash
find . -type f -name "*.go" -exec sed -i '' 's|github.com/yourusername/autopo/backend-go/|github.com/andresuchdata/autopo-py/backend-go/|g' {} \;
find . -type f -name "*.go" -exec sed -i '' 's|github.com/yourusername/autopo-backend-go/|github.com/andresuchdata/autopo-py/backend-go/|g' {} \;
find . -type f -name "*.go" -exec sed -i '' 's|github.com/yourusername/autopo/|github.com/andresuchdata/autopo-py/backend-go/|g' {} \;