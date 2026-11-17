import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import { BUSINESS_CONFIG } from '../../config/businessConfig';
import { formatINR } from '../../services/indianValidation';
import { Order } from '../../types';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInvoiceHtml(order: Order): string {
  const addr = [
    order.deliveryAddress.houseNo,
    order.deliveryAddress.street,
    order.deliveryAddress.locality,
    order.deliveryAddress.landmark,
    order.deliveryAddress.city,
    order.deliveryAddress.district,
    `${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}`,
  ]
    .filter(Boolean)
    .join(', ');

  const rows = order.itemsPreview
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">
          <strong>${escapeHtml(item.name)}</strong><br/>
          <span style="color:#64748b;font-size:12px;">SKU: ${escapeHtml(item.sku || item.productId)}${
        item.selectedSize ? ` · Size: ${escapeHtml(item.selectedSize)}` : ''
      }${item.selectedColor ? ` · Colour: ${escapeHtml(item.selectedColor)}` : ''}</span>
        </td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${item.unitSellingPrice.toLocaleString('en-IN')}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${(item.taxAmount || 0).toLocaleString('en-IN')}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;"><strong>₹${item.lineTotal.toLocaleString('en-IN')}</strong></td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>CARTZY Tax Invoice - ${escapeHtml(order.orderNumber)}</title>
</head>
<body style="font-family:Inter,Arial,sans-serif;color:#1f2937;padding:32px;max-width:820px;margin:0 auto;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #14213D;padding-bottom:16px;margin-bottom:24px;">
    <div>
      <h1 style="margin:0;color:#14213D;font-size:24px;">CARTZY</h1>
      <p style="margin:4px 0;font-size:12px;color:#475569;">${escapeHtml(BUSINESS_CONFIG.legalEntityName)}</p>
      <p style="margin:2px 0;font-size:12px;color:#475569;">${escapeHtml(BUSINESS_CONFIG.registeredAddress)}</p>
      <p style="margin:2px 0;font-size:12px;color:#14213D;"><strong>GSTIN:</strong> ${escapeHtml(BUSINESS_CONFIG.gstin)}</p>
    </div>
    <div style="text-align:right;">
      <h2 style="margin:0;color:#14213D;font-size:18px;">TAX INVOICE / DIGITAL RECEIPT</h2>
      <p style="margin:4px 0;font-size:13px;"><strong>Invoice / Order #:</strong> ${escapeHtml(order.orderNumber)}</p>
      <p style="margin:2px 0;font-size:12px;color:#475569;">Date: ${new Date(order.createdAt).toLocaleString('en-IN')}</p>
      <p style="margin:2px 0;font-size:12px;color:#475569;">Payment: ${escapeHtml(order.paymentMethod)} (${escapeHtml(order.paymentStatus)})</p>
      ${order.razorpayPaymentId ? `<p style="margin:2px 0;font-size:11px;color:#475569;">Txn Ref: ${escapeHtml(order.razorpayPaymentId)}</p>` : ''}
    </div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:20px;">
    <strong style="font-size:13px;color:#14213D;">Bill To / Deliver To:</strong>
    <p style="margin:4px 0;font-size:13px;">${escapeHtml(order.deliveryAddress.fullName)} · +91 ${escapeHtml(order.deliveryAddress.mobile)}</p>
    <p style="margin:2px 0;font-size:12px;color:#475569;">${escapeHtml(addr)}</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
    <thead>
      <tr style="background:#14213D;color:#fff;">
        <th style="padding:10px;text-align:left;">#</th>
        <th style="padding:10px;text-align:left;">Product Details</th>
        <th style="padding:10px;text-align:center;">Qty</th>
        <th style="padding:10px;text-align:right;">Unit Price</th>
        <th style="padding:10px;text-align:right;">GST Incl.</th>
        <th style="padding:10px;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-left:auto;max-width:320px;font-size:13px;">
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal (Incl. GST):</span><span>₹${order.pricing.subtotal.toLocaleString('en-IN')}</span></div>
    ${order.pricing.couponDiscount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#047857;"><span>Coupon (${escapeHtml(order.pricing.couponCode || '')}):</span><span>- ₹${order.pricing.couponDiscount.toLocaleString('en-IN')}</span></div>` : ''}
    ${(order.pricing.rewardsDiscount || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#047857;"><span>Rewards (${order.pricing.rewardsRedeemed || 0} pts):</span><span>- ₹${(order.pricing.rewardsDiscount || 0).toLocaleString('en-IN')}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Delivery Charges:</span><span>${order.pricing.deliveryCharge === 0 ? 'FREE' : `₹${order.pricing.deliveryCharge.toLocaleString('en-IN')}`}</span></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Platform &amp; Handling Fee:</span><span style="color:#047857;">FREE (₹0)</span></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;color:#64748b;font-size:12px;"><span>Taxable Value (Excl. GST):</span><span>₹${Math.max(0, order.pricing.subtotal - order.pricing.taxAmount).toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;color:#64748b;font-size:12px;"><span>Included GST (CGST + SGST):</span><span>₹${order.pricing.taxAmount.toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;margin-top:6px;border-top:2px solid #14213D;font-size:16px;font-weight:bold;color:#14213D;"><span>Grand Total:</span><span>₹${order.pricing.finalAmount.toLocaleString('en-IN')}</span></div>
    ${order.refundStatus && order.refundStatus !== 'None' ? `<div style="margin-top:8px;padding:8px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:12px;color:#065f46;"><strong>Refund Status:</strong> ${escapeHtml(order.refundStatus)}${order.refundAmount ? ` (₹${order.refundAmount.toLocaleString('en-IN')})` : ''}</div>` : ''}
  </div>
  <p style="margin-top:28px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;">Computer-generated GST invoice &amp; digital receipt from ${escapeHtml(BUSINESS_CONFIG.legalEntityName)} (${escapeHtml(BUSINESS_CONFIG.supportEmail)}).</p>
</body>
</html>`;
}

export const OrderInvoiceModal: React.FC<{
  order: Order | null;
  onClose: () => void;
}> = ({ order, onClose }) => {
  if (!order) return null;

  const fullAddress = [
    order.deliveryAddress.houseNo,
    order.deliveryAddress.street,
    order.deliveryAddress.locality,
    order.deliveryAddress.landmark,
    order.deliveryAddress.city,
    order.deliveryAddress.district,
    `${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}`,
  ]
    .filter(Boolean)
    .join(', ');

  const handleDownload = () => {
    const html = buildInvoiceHtml(order);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CARTZY-Invoice-${order.orderNumber}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#14213D]">GST Tax Invoice</h2>
            <p className="text-xs font-mono text-slate-500">{order.orderNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="px-3.5 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Invoice
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-[#14213D] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 text-xs">
          <div className="grid sm:grid-cols-2 gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <p className="text-base font-extrabold text-[#14213D]">CARTZY</p>
              <p className="text-slate-600 font-semibold">{BUSINESS_CONFIG.legalEntityName}</p>
              <p className="text-slate-500">{BUSINESS_CONFIG.registeredAddress}</p>
              <p className="font-mono text-[#14213D] font-bold">GSTIN: {BUSINESS_CONFIG.gstin}</p>
            </div>
            <div className="sm:text-right space-y-1">
              <p className="font-bold text-[#14213D]">
                Order / Invoice #: <span className="font-mono">{order.orderNumber}</span>
              </p>
              <p className="text-slate-500">
                Order Date: {new Date(order.createdAt).toLocaleString('en-IN')}
              </p>
              <p className="text-slate-600">
                Payment: <strong>{order.paymentMethod}</strong> ({order.paymentStatus})
              </p>
              {order.razorpayPaymentId && (
                <p className="font-mono text-slate-500">Ref: {order.razorpayPaymentId}</p>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
            <p className="font-bold text-[#14213D] mb-1">Billing &amp; Shipping Address</p>
            <p className="font-semibold text-[#1F2937]">
              {order.deliveryAddress.fullName} · +91 {order.deliveryAddress.mobile}
            </p>
            <p className="text-slate-600 mt-0.5">{fullAddress}</p>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#14213D] text-white">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Unit Price</th>
                  <th className="p-3 text-right">GST Incl.</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.itemsPreview.map((item, idx) => (
                  <tr key={`${item.productId}_${idx}`} className="border-t border-slate-100">
                    <td className="p-3">
                      <p className="font-semibold text-[#14213D]">{item.name}</p>
                      <p className="text-[11px] text-slate-500">
                        SKU: {item.sku || item.productId}
                        {item.selectedSize ? ` · Size: ${item.selectedSize}` : ''}
                        {item.selectedColor ? ` · Colour: ${item.selectedColor}` : ''}
                      </p>
                    </td>
                    <td className="p-3 text-center font-mono tabular-nums">{item.quantity}</td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      {formatINR(item.unitSellingPrice)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      {formatINR(item.taxAmount || 0)}
                    </td>
                    <td className="p-3 text-right font-bold font-mono tabular-nums text-[#14213D]">
                      {formatINR(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal (Incl. GST)</span>
              <span className="font-mono tabular-nums">{formatINR(order.pricing.subtotal)}</span>
            </div>
            {order.pricing.couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Coupon ({order.pricing.couponCode})</span>
                <span className="font-mono tabular-nums">
                  - {formatINR(order.pricing.couponDiscount)}
                </span>
              </div>
            )}
            {(order.pricing.rewardsDiscount || 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Rewards ({order.pricing.rewardsRedeemed} pts)</span>
                <span className="font-mono tabular-nums">
                  - {formatINR(order.pricing.rewardsDiscount || 0)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">Delivery Charges</span>
              <span className="font-mono tabular-nums">
                {order.pricing.deliveryCharge === 0
                  ? 'FREE'
                  : formatINR(order.pricing.deliveryCharge)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Platform &amp; Handling Fee</span>
              <span className="text-emerald-700 font-semibold font-mono">FREE (₹0)</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Taxable Value (Excl. GST)</span>
              <span className="font-mono tabular-nums">
                {formatINR(Math.max(0, order.pricing.subtotal - order.pricing.taxAmount))}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Included GST (CGST + SGST)</span>
              <span className="font-mono tabular-nums">{formatINR(order.pricing.taxAmount)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between font-extrabold text-base text-[#14213D]">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums">{formatINR(order.pricing.finalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
