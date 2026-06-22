import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origins = searchParams.get('origins');
  const destinations = searchParams.get('destinations');
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!origins || !destinations) {
    return NextResponse.json(
      { error: 'Missing origins or destinations' },
      { status: 400 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing Google Maps API Key' },
      { status: 500 }
    );
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.append('origins', origins);
    url.searchParams.append('destinations', destinations);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('units', 'imperial');

    console.log('📡 Proxying distance request to Google API...');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('❌ Google API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Google API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    if (data.status !== "OK") {
      console.error('❌ Google API status error:', data.status, data.error_message);
      return NextResponse.json(
        { error: data.error_message || data.status },
        { status: 400 }
      );
    }

    console.log('✅ Distance data fetched successfully');
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('❌ Error fetching distance:', error);
    return NextResponse.json(
      { error: 'Failed to calculate distances' },
      { status: 500 }
    );
  }
}