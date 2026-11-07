#!/bin/bash

# Improved Image Optimization Script using ImageMagick
# This script optimizes images intelligently, only keeping changes that reduce file size

echo "=== Improved Image Optimization Script ==="
echo "Optimizing images with smart size checking..."
echo ""

# Array of images to optimize
declare -a images=(
    "images/slider/slider-bg-8.jpeg"
    "images/about/misctools.jpg"
    "images/slider/slider-bg-7.jpeg"
    "images/about/3dprinter.webp"
    "images/open.gif"
    "images/slider/slider-bg-6.webp"
    "images/wood-shop/zones_wood.jpg"
    "images/clipart/questionmark.webp"
)

# Function to get file size in bytes
get_size_bytes() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        stat -f%z "$1"
    else
        stat -c%s "$1"
    fi
}

# Function to format bytes to human readable
format_size() {
    local size=$1
    if [ $size -lt 1024 ]; then
        echo "${size}B"
    elif [ $size -lt 1048576 ]; then
        echo "$((size / 1024))KB"
    else
        echo "$((size / 1048576))MB"
    fi
}

total_original=0
total_optimized=0

# Process each image
for img in "${images[@]}"; do
    if [ -f "$img" ]; then
        echo "Processing: $img"
        
        # Get original size
        original_size=$(get_size_bytes "$img")
        original_readable=$(format_size $original_size)
        echo "  Original size: $original_readable"
        
        # Create temporary optimized version
        temp_img="${img}.tmp"
        
        # Get file extension
        ext="${img##*.}"
        
        # Optimize based on file type
        case "$ext" in
            jpg|jpeg)
                # For JPEG: strip metadata, optimize quality to 82%, progressive
                magick "$img" -strip -quality 82 -sampling-factor 4:2:0 -interlace Plane "$temp_img"
                ;;
            webp)
                # For WebP: optimize with better compression settings
                magick "$img" -strip -quality 82 -define webp:method=6 -define webp:alpha-quality=85 "$temp_img"
                ;;
            gif)
                # For GIF: optimize colors and layers
                magick "$img" -strip -layers optimize -fuzz 2% "$temp_img"
                ;;
            png)
                # For PNG: strip metadata and optimize
                magick "$img" -strip -define png:compression-level=9 "$temp_img"
                ;;
        esac
        
        # Get optimized size
        optimized_size=$(get_size_bytes "$temp_img")
        optimized_readable=$(format_size $optimized_size)
        
        # Compare sizes and only keep if smaller
        if [ $optimized_size -lt $original_size ]; then
            savings=$((original_size - optimized_size))
            percent=$((savings * 100 / original_size))
            savings_readable=$(format_size $savings)
            
            mv "$temp_img" "$img"
            echo "  ✓ Optimized size: $optimized_readable"
            echo "  ✓ Saved: $savings_readable (${percent}%)"
            
            total_original=$((total_original + original_size))
            total_optimized=$((total_optimized + optimized_size))
        else
            rm "$temp_img"
            echo "  ✗ Optimization would increase size - keeping original"
            
            total_original=$((total_original + original_size))
            total_optimized=$((total_optimized + original_size))
        fi
        echo ""
    else
        echo "File not found: $img"
        echo ""
    fi
done

echo "=== Optimization Complete ==="
echo ""
echo "Total original size: $(format_size $total_original)"
echo "Total optimized size: $(format_size $total_optimized)"
total_savings=$((total_original - total_optimized))
total_percent=$((total_savings * 100 / total_original))
echo "Total saved: $(format_size $total_savings) (${total_percent}%)"
echo ""
echo "Original images backed up to: images/originals/"
echo ""
echo "Final file sizes:"
ls -lh images/slider/slider-bg-8.jpeg images/about/misctools.jpg images/slider/slider-bg-7.jpeg images/about/3dprinter.webp images/open.gif images/slider/slider-bg-6.webp images/wood-shop/zones_wood.jpg images/clipart/questionmark.webp 2>/dev/null | awk '{print $5, $9}'