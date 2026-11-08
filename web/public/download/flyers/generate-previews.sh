#!/bin/bash

# Script to generate preview images from PDF flyers
# Creates 8x10 inch preview images (800x1000 pixels) from all PDF files

# Set the directory to the script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
DENSITY=150          # DPI for PDF rendering
WIDTH=800           # Width in pixels (8 inches at 100 DPI)
HEIGHT=1000         # Height in pixels (10 inches at 100 DPI)
QUALITY=90          # JPEG/PNG quality (0-100)

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null && ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is not installed."
    echo "Please install ImageMagick to use this script."
    exit 1
fi

# Determine which command to use (magick for v7+, convert for v6)
if command -v magick &> /dev/null; then
    CONVERT_CMD="magick"
else
    CONVERT_CMD="convert"
fi

echo "Generating preview images from PDF files..."
echo "Using command: $CONVERT_CMD"
echo "Output size: ${WIDTH}x${HEIGHT} pixels"
echo ""

# Counter for processed files
count=0

# Process all PDF files in the current directory
for pdf in *.pdf; do
    # Check if any PDF files exist
    if [ ! -f "$pdf" ]; then
        echo "No PDF files found in the current directory."
        exit 0
    fi
    
    # Generate output filename
    output="${pdf%.pdf}-preview.png"
    
    echo "Processing: $pdf -> $output"
    
    # Convert PDF to PNG preview
    # [0] selects only the first page of the PDF
    $CONVERT_CMD -density "$DENSITY" "${pdf}[0]" \
                 -resize "${WIDTH}x${HEIGHT}" \
                 -quality "$QUALITY" \
                 "$output"
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Successfully created $output"
        ((count++))
    else
        echo "  ✗ Failed to create $output"
    fi
    echo ""
done

echo "Completed! Generated $count preview image(s)."