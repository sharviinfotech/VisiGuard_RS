import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface VisitorData {
  visitor_id: string;
  name: string;
  phone?: string | null;
  company?: string | null;
  purpose?: string | null;
  has_laptop?: boolean | null;
  photo_url?: string | null;
  check_in_time?: string | null;
  host?: {
    name?: string;
    department?: { name?: string } | null;
  } | null;
  department?: {
    name?: string;
    floor_number?: string | null;
    building_section?: string | null;
    location?: {
      name?: string;
      geo_address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      emergency_contact?: string | null;
      assembly_point?: string | null;
    } | null;
  } | null;
  gate?: {
    location?: {
      name?: string;
      geo_address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      emergency_contact?: string | null;
      assembly_point?: string | null;
    } | null;
  } | null;
}

export default function PrintBadge() {
  const [searchParams] = useSearchParams();
  const [visitor, setVisitor] = useState<VisitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printWindowRef = useRef<Window | null>(null);

  const visitorId = searchParams.get('id');

  useEffect(() => {
    if (visitorId) {
      fetchVisitor();
    } else {
      setError('No visitor ID provided');
      setLoading(false);
    }
  }, [visitorId]);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const fetchVisitor = async () => {
    try {
      const { data, error } = await supabase
        .from('visitors')
        .select(`
          *,
          host:employees(name, department:departments(name)),
          department:departments(name, floor_number, building_section, location:locations!departments_location_id_fkey(name, geo_address, latitude, longitude, emergency_contact, assembly_point)),
          gate:gates(name, location:locations!gates_location_id_fkey(name, geo_address, latitude, longitude, emergency_contact, assembly_point))
        `)
        .eq('id', visitorId)
        .single();

      if (error) throw error;

      if (data) {
        setVisitor(data as unknown as VisitorData);
        await supabase.from('visitors').update({ badge_printed: true }).eq('id', visitorId);
      } else {
        setError('Visitor not found');
      }
    } catch (err) {
      console.error('Error fetching visitor:', err);
      setError('Failed to load visitor data');
    } finally {
      setLoading(false);
    }
  };

  /** Build the full standalone HTML for the badge — no Tailwind, no React, pure HTML/CSS */
  const buildBadgeHtml = (v: VisitorData): string => {
    const checkInTime = v.check_in_time ? new Date(v.check_in_time) : new Date();
    const dateStr = format(checkInTime, 'dd/MM/yyyy');
    const timeStr = format(checkInTime, 'HH:mm');

    const qrData = encodeURIComponent(JSON.stringify({
      visitorId: v.visitor_id, name: v.name, action: 'checkout',
    }));
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}&format=png`;

    const location = v.department?.location || v.gate?.location;
    const geoAddress = location?.geo_address;
    const lat = location?.latitude;
    const lng = location?.longitude;
    const emergencyContact = location?.emergency_contact;
    const assemblyPoint = location?.assembly_point;

    const navigationUrl = lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : geoAddress
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(geoAddress)}`
        : null;

    const navQrUrl = navigationUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(navigationUrl)}&format=png`
      : null;

    const departmentName = v.host?.department?.name || v.department?.name || 'N/A';
    const hostName = v.host?.name || 'N/A';
    const locationLine = [
      v.department?.floor_number && `Floor ${v.department.floor_number}`,
      v.department?.building_section,
    ].filter(Boolean).join(', ');

    const photoSection = v.photo_url
      ? `<img src="${v.photo_url}" alt="${v.name}" style="width:80px;height:80px;object-fit:cover;" />`
      : `<div style="width:80px;height:80px;background:#d1d5db;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:#374151;">${getInitials(v.name)}</div>`;

    const locationSection = (geoAddress || navigationUrl) ? `
      <div style="display:flex;border-top:1px solid #d1d5db;padding:6px 8px;background:#e0f2fe;align-items:center;gap:8px;">
        <span style="font-size:14px;">📍</span>
        <div style="flex:1;font-size:10px;">
          <p style="font-weight:600;color:#0369a1;">${geoAddress || location?.name || 'Location'}</p>
          <p style="color:#64748b;font-size:9px;">Scan QR to navigate →</p>
        </div>
        ${navQrUrl ? `<img src="${navQrUrl}" alt="Navigate" style="width:50px;height:50px;" />` : ''}
      </div>` : '';

    const emergencySection = emergencyContact
      ? `<p style="margin-top:4px;font-weight:600;color:#dc2626;">🆘 Emergency: ${emergencyContact}</p>` : '';
    const assemblySection = assemblyPoint
      ? `<p style="margin-top:2px;font-weight:600;color:#0369a1;">🚨 Assembly Point: ${assemblyPoint}</p>` : '';
    const floorSection = locationLine
      ? `<div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;font-size:11px;"><span style="width:96px;font-weight:600;">Location</span><span style="flex:1;">: ${locationLine}</span></div>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Visitor Badge - ${v.name}</title>
  <style>
    @page {
      size: A5 portrait;
      margin: 10mm;
    }
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f5f5f5;
      color: #000;
    }
    .screen-only {
      display: block;
      padding: 20px;
      text-align: center;
    }
    .btn {
      display: inline-block;
      margin: 0 8px 16px;
      padding: 12px 28px;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      cursor: pointer;
      color: white;
    }
    .btn-print { background: #0891b2; }
    .btn-back  { background: #6b7280; }
    .btn:hover { opacity: 0.9; }
    .badge-wrap {
      display: flex;
      justify-content: center;
      margin: 0 auto;
    }
    .badge {
      background: white;
      border: 2px solid #1f2937;
      border-radius: 8px;
      overflow: hidden;
      width: 350px;
      font-family: Arial, Helvetica, sans-serif;
    }
    @media print {
      html, body {
        background: white !important;
      }
      .screen-only {
        display: none !important;
      }
      .badge-wrap {
        display: block;
        margin: 0;
        padding: 0;
      }
      .badge {
        width: 100% !important;
        border-radius: 0 !important;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="screen-only">
    <button class="btn btn-print" onclick="printBadge()">🖨️ Print Badge</button>
    <button class="btn btn-print" style="background:#059669;" onclick="printBadge()">📄 Save as PDF</button>
    <button class="btn btn-back" onclick="window.close()">✕ Close</button>
  </div>

  <div class="badge-wrap">
    <div class="badge">

      <!-- Header -->
      <div style="display:flex;align-items:center;border-bottom:2px solid #1f2937;">
        <div style="width:64px;padding:8px;border-right:2px solid #1f2937;display:flex;align-items:center;justify-content:center;">
          <div style="width:48px;height:48px;background:#1e3a8a;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:18px;">R</div>
        </div>
        <div style="flex:1;text-align:center;padding:4px 0;color:#dc2626;font-weight:600;font-style:italic;font-size:14px;">Resustainability</div>
      </div>

      <!-- Title + Photo -->
      <div style="display:flex;border-bottom:2px solid #1f2937;">
        <div style="flex:1;background:#1f2937;color:white;padding:8px;">
          <h2 style="font-size:18px;font-weight:bold;margin:0;">SAFETY PERMIT</h2>
          <p style="font-size:14px;font-weight:600;margin:0;">VISITOR</p>
        </div>
        <div style="width:96px;padding:4px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;">
          ${photoSection}
        </div>
      </div>

      <!-- Details -->
      <div style="font-size:11px;">
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Serial No</span><span style="flex:1;">: ${v.visitor_id}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Date</span><span style="flex:1;">: ${dateStr}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Time</span><span style="flex:1;">: ${timeStr}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Name</span><span style="flex:1;font-weight:500;">: ${v.name}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Mobile</span><span style="flex:1;">: ${v.phone || 'N/A'}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Company</span><span style="flex:1;">: ${v.company || 'N/A'}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Dept. To Meet</span><span style="flex:1;">: ${departmentName}</span></div>
        ${floorSection}
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Host</span><span style="flex:1;">: ${hostName}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Purpose</span><span style="flex:1;">: ${v.purpose || 'N/A'}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">IT Asset</span><span style="flex:1;">: ${v.has_laptop ? 'Laptop' : 'NA'}</span></div>
        <div style="display:flex;padding:6px;border-bottom:1px solid #d1d5db;"><span style="width:96px;font-weight:600;">Validity</span><span style="flex:1;">: ${dateStr}</span></div>
      </div>

      <!-- Signatures -->
      <div style="display:flex;border-top:2px solid #1f2937;text-align:center;font-size:11px;">
        <div style="flex:1;padding:8px;border-right:1px solid #d1d5db;">
          <div style="height:32px;border-bottom:1px dashed #9ca3af;margin-bottom:4px;"></div>
          <p style="font-weight:600;font-style:italic;">Security Signature</p>
        </div>
        <div style="flex:1;padding:8px;border-right:1px solid #d1d5db;">
          <div style="height:32px;border-bottom:1px dashed #9ca3af;margin-bottom:4px;"></div>
          <p style="font-weight:600;font-style:italic;">Visitor Signature</p>
        </div>
        <div style="flex:1;padding:8px;">
          <div style="height:32px;border-bottom:1px dashed #9ca3af;margin-bottom:4px;"></div>
          <p style="font-weight:600;font-style:italic;">Officer Signature</p>
        </div>
      </div>

      <!-- Location Navigation -->
      ${locationSection}

      <!-- Safety Guidelines + QR -->
      <div style="display:flex;border-top:2px solid #1f2937;background:#f3f4f6;">
        <div style="flex:1;padding:8px;font-size:10px;line-height:1.4;">
          <p style="margin-bottom:2px;">1. Your safety is your responsibility.</p>
          <p style="margin-bottom:2px;">2. Always follow the safety procedures.</p>
          <p style="margin-bottom:2px;">3. Always keep company work place clean.</p>
          <p style="margin-bottom:2px;">4. When in doubt, contact our official for instruction, guidance &amp; training.</p>
          ${emergencySection}
          ${assemblySection}
        </div>
        <div style="width:96px;padding:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:1px solid #d1d5db;">
          <img src="${qrCodeUrl}" alt="QR Code" style="width:80px;height:80px;" onload="checkAllImagesLoaded()" />
          <span style="font-size:8px;text-align:center;margin-top:2px;font-weight:600;">Check-out</span>
        </div>
      </div>

    </div>
  </div>

  <script>
    var imagesLoaded = 0;
    var totalImages = document.querySelectorAll('img').length;

    function checkAllImagesLoaded() {
      imagesLoaded++;
      if (imagesLoaded >= totalImages) {
        // All images loaded — small extra delay then auto-print
        setTimeout(function() { window.print(); }, 300);
      }
    }

    function printBadge() {
      window.print();
    }

    // Fallback: print after 4 seconds regardless
    setTimeout(function() { window.print(); }, 4000);
  </script>
</body>
</html>`;
  };

  /** Open the badge as a pure standalone HTML window */
  const openPrintWindow = (v: VisitorData) => {
    const html = buildBadgeHtml(v);
    const printWin = window.open('', '_blank', 'width=600,height=800,toolbar=0,menubar=0,scrollbars=1');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWindowRef.current = printWin;
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'Arial, sans-serif',
        background: '#f5f5f5',
        gap: '16px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #0891b2',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: '#6b7280', fontSize: '16px', margin: 0 }}>Loading badge...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !visitor) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <p style={{ color: '#dc2626', fontSize: '18px' }}>{error || 'Visitor not found'}</p>
        <button
          onClick={() => window.history.back()}
          style={{ marginTop: '16px', padding: '10px 24px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          ← Go Back
        </button>
      </div>
    );
  }

  const checkInTime = visitor.check_in_time ? new Date(visitor.check_in_time) : new Date();

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      {/* Preview header */}
      <div style={{ maxWidth: '400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => openPrintWindow(visitor)}
            style={{ padding: '12px 28px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}
          >
            🖨️ Print Badge
          </button>
          <button
            onClick={() => openPrintWindow(visitor)}
            style={{ padding: '12px 28px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}
          >
            📄 Save as PDF
          </button>
          <button
            onClick={() => window.history.back()}
            style={{ padding: '12px 28px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>

        {/* Badge preview */}
        <div style={{ background: 'white', border: '2px solid #1f2937', borderRadius: '8px', overflow: 'hidden', width: '350px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid #1f2937' }}>
            <div style={{ width: '64px', padding: '8px', borderRight: '2px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '48px', height: '48px', background: '#1e3a8a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '18px' }}>R</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '4px 0', color: '#dc2626', fontWeight: 600, fontStyle: 'italic', fontSize: '14px' }}>Resustainability</div>
          </div>

          {/* Title + Photo */}
          <div style={{ display: 'flex', borderBottom: '2px solid #1f2937' }}>
            <div style={{ flex: 1, background: '#1f2937', color: 'white', padding: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>SAFETY PERMIT</h2>
              <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>VISITOR</p>
            </div>
            <div style={{ width: '96px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
              {visitor.photo_url ? (
                <img src={visitor.photo_url} alt={visitor.name} style={{ width: '80px', height: '80px', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '80px', height: '80px', background: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', fontSize: '24px', fontWeight: 'bold' }}>
                  {getInitials(visitor.name)}
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          {[
            ['Serial No', visitor.visitor_id],
            ['Date', format(checkInTime, 'dd/MM/yyyy')],
            ['Time', format(checkInTime, 'HH:mm')],
            ['Name', visitor.name],
            ['Mobile', visitor.phone || 'N/A'],
            ['Company', visitor.company || 'N/A'],
            ['Dept. To Meet', visitor.host?.department?.name || visitor.department?.name || 'N/A'],
            ['Host', visitor.host?.name || 'N/A'],
            ['Purpose', visitor.purpose || 'N/A'],
            ['IT Asset', visitor.has_laptop ? 'Laptop' : 'NA'],
            ['Validity', format(checkInTime, 'dd/MM/yyyy')],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', padding: '5px 6px', borderBottom: '1px solid #d1d5db', fontSize: '11px' }}>
              <span style={{ width: '96px', fontWeight: 600 }}>{label}</span>
              <span style={{ flex: 1 }}>: {value}</span>
            </div>
          ))}

          {/* Signatures */}
          <div style={{ display: 'flex', borderTop: '2px solid #1f2937', textAlign: 'center', fontSize: '11px' }}>
            {['Security Signature', 'Visitor Signature', 'Officer Signature'].map((label, i) => (
              <div key={label} style={{ flex: 1, padding: '8px', borderRight: i < 2 ? '1px solid #d1d5db' : 'none' }}>
                <div style={{ height: '32px', borderBottom: '1px dashed #9ca3af', marginBottom: '4px' }} />
                <p style={{ fontWeight: 600, fontStyle: 'italic' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Guidelines + QR */}
          <div style={{ display: 'flex', borderTop: '2px solid #1f2937', background: '#f3f4f6' }}>
            <div style={{ flex: 1, padding: '8px', fontSize: '10px', lineHeight: 1.4 }}>
              <p style={{ marginBottom: '2px' }}>1. Your safety is your responsibility.</p>
              <p style={{ marginBottom: '2px' }}>2. Always follow the safety procedures.</p>
              <p style={{ marginBottom: '2px' }}>3. Always keep company work place clean.</p>
              <p>4. Contact officials for guidance and training.</p>
            </div>
            <div style={{ width: '96px', padding: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #d1d5db' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({ visitorId: visitor.visitor_id, name: visitor.name, action: 'checkout' }))}&format=png`}
                alt="QR Code"
                style={{ width: '80px', height: '80px' }}
              />
              <span style={{ fontSize: '8px', textAlign: 'center', marginTop: '2px', fontWeight: 600 }}>Check-out</span>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '12px', marginTop: '12px' }}>
          Click "Print Badge" above to open the print dialog
        </p>
      </div>
    </div>
  );
}
