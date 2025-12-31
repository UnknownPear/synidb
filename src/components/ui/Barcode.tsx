import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type BarcodeProps = {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
};

// Use React.forwardRef to allow the parent to get a direct reference to the SVG element
const Barcode = React.forwardRef<SVGSVGElement, BarcodeProps>(
  ({ value, width = 2, height = 52, displayValue = true }, ref) => {
    const internalRef = useRef<SVGSVGElement>(null);
    // Allow parent to either pass a ref or let the component manage its own
    const barcodeRef = ref || internalRef;

    useEffect(() => {
      if (barcodeRef.current) {
        JsBarcode(barcodeRef.current, value, {
          format: 'code128',
          width,
          height,
          displayValue,
          margin: 0,
        });
      }
    }, [value, width, height, displayValue, barcodeRef]);

    return <svg ref={barcodeRef} />;
  }
);

export default Barcode;