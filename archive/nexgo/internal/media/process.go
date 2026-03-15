package media

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"

	// Register decoders for standard formats.
	_ "image/gif"
)

// ImageMetadata contains extracted image information.
type ImageMetadata struct {
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Format string `json:"format"`
}

// ResizeImage resizes an image to fit within maxWidth x maxHeight while preserving aspect ratio.
// If the image already fits, it is returned unchanged.
// Uses nearest-neighbor scaling (stdlib only, no external dependencies).
func ResizeImage(data []byte, maxWidth, maxHeight int) ([]byte, error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decoding image: %w", err)
	}

	bounds := img.Bounds()
	origW := bounds.Dx()
	origH := bounds.Dy()

	// If already within bounds, return original data.
	if origW <= maxWidth && origH <= maxHeight {
		return data, nil
	}

	// Calculate new dimensions preserving aspect ratio.
	newW, newH := fitDimensions(origW, origH, maxWidth, maxHeight)

	// Create resized image using nearest-neighbor scaling.
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	scaleNearest(dst, img)

	// Encode as the original format if possible, otherwise JPEG.
	var buf bytes.Buffer
	switch format {
	case "png":
		if err := png.Encode(&buf, dst); err != nil {
			return nil, fmt.Errorf("encoding resized PNG: %w", err)
		}
	default:
		if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 85}); err != nil {
			return nil, fmt.Errorf("encoding resized JPEG: %w", err)
		}
	}

	return buf.Bytes(), nil
}

// ConvertToJPEG converts any supported image format to JPEG with the given quality (1-100).
func ConvertToJPEG(data []byte, quality int) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decoding image: %w", err)
	}

	if quality < 1 {
		quality = 1
	}
	if quality > 100 {
		quality = 100
	}

	// Draw onto an RGBA canvas to handle transparency and indexed colors.
	bounds := img.Bounds()
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.Draw(rgba, bounds, img, bounds.Min, draw.Over)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, rgba, &jpeg.Options{Quality: quality}); err != nil {
		return nil, fmt.Errorf("encoding JPEG: %w", err)
	}

	return buf.Bytes(), nil
}

// ExtractImageMetadata extracts dimensions and format from image data.
func ExtractImageMetadata(data []byte) (*ImageMetadata, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decoding image config: %w", err)
	}

	return &ImageMetadata{
		Width:  cfg.Width,
		Height: cfg.Height,
		Format: format,
	}, nil
}

// fitDimensions calculates new width and height that fit within maxW x maxH
// while preserving the aspect ratio.
func fitDimensions(origW, origH, maxW, maxH int) (int, int) {
	ratioW := float64(maxW) / float64(origW)
	ratioH := float64(maxH) / float64(origH)

	ratio := ratioW
	if ratioH < ratioW {
		ratio = ratioH
	}

	newW := int(float64(origW) * ratio)
	newH := int(float64(origH) * ratio)

	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	return newW, newH
}

// scaleNearest performs nearest-neighbor scaling from src to dst.
func scaleNearest(dst *image.RGBA, src image.Image) {
	dstBounds := dst.Bounds()
	srcBounds := src.Bounds()

	dstW := dstBounds.Dx()
	dstH := dstBounds.Dy()
	srcW := srcBounds.Dx()
	srcH := srcBounds.Dy()

	for y := 0; y < dstH; y++ {
		srcY := srcBounds.Min.Y + y*srcH/dstH
		for x := 0; x < dstW; x++ {
			srcX := srcBounds.Min.X + x*srcW/dstW
			dst.Set(dstBounds.Min.X+x, dstBounds.Min.Y+y, src.At(srcX, srcY))
		}
	}
}
