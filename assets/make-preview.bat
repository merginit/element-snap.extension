@echo off
if not exist "preview" mkdir "preview"

magick options-light.png -resize 1280x800 -background transparent -gravity center -extent 1280x800 preview\options-light-preview.png
magick options-dark.png -resize 1280x800 -background transparent -gravity center -extent 1280x800 preview\options-dark-preview.png
magick extension-light.png -resize 1280x800 -background transparent -gravity center -extent 1280x800 preview\extension-light-preview.png
magick extension-dark.png -resize 1280x800 -background transparent -gravity center -extent 1280x800 preview\extension-dark-preview.png

echo Done! Preview images created in preview folder.
