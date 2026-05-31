// ----- DOM elements -----
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const scanBtn = document.getElementById('scanBtn');
const processBtn = document.getElementById('processBtn');
const correlateBtn = document.getElementById('correlateBtn');
const resetViewBtn = document.getElementById('resetViewBtn');
const scatterDiv = document.getElementById('scatter3d');
const topicKeywordsDiv = document.getElementById('topicKeywords');
const anomalyList = document.getElementById('anomalyList');
const docCountSpan = document.getElementById('docCount');
const topicCountSpan = document.getElementById('topicCount');
const anomalyCountSpan = document.getElementById('anomalyCount');
const correlationModal = document.getElementById('correlationModal');
const closeModal = document.querySelector('.close');

let currentPlotData = null;
let currentLayout = null;

// ----- Helpers -----
async function fetchVizData() {
    const res = await fetch('/viz-data');
    const data = await res.json();
    if (data.error) {
        console.warn(data.error);
        return null;
    }
    return data;
}

async function renderScatter() {
    const viz = await fetchVizData();
    if (!viz || !viz.points.length) {
        scatterDiv.innerHTML = '<div style="padding:2rem;text-align:center">⚠️ No processed data. Upload files and run topic modeling.</div>';
        return;
    }
    const points = viz.points;
    const topicKeywords = viz.topics_keywords;
    
    // Update stats
    const topicsSet = new Set(points.map(p => p.topic));
    const anomalies = points.filter(p => p.is_anomaly);
    docCountSpan.innerText = points.length;
    topicCountSpan.innerText = topicsSet.size;
    anomalyCountSpan.innerText = anomalies.length;
    
    // Build traces for each topic
    const traces = [];
    const colorPalette = ['#5f9eff','#ff6b6b','#4cd964','#ffcc00','#bf5fff','#ff9500','#64d2ff','#ff2a7c'];
    const groups = {};
    points.forEach(p => { if(!groups[p.topic]) groups[p.topic]=[]; groups[p.topic].push(p); });
    
    for (const [tid, pts] of Object.entries(groups)) {
        const color = colorPalette[Math.abs(parseInt(tid)) % colorPalette.length];
        const hoverText = pts.map(p => `<b>${p.filename}</b><br>Topic: ${p.topic}<br>Anomaly: ${p.is_anomaly}<br>${p.preview}...`);
        traces.push({
            x: pts.map(p => p.x),
            y: pts.map(p => p.y),
            z: pts.map(p => p.z),
            mode: 'markers',
            type: 'scatter3d',
            name: `Topic ${tid}`,
            marker: { size: 5, color: color, opacity: 0.8 },
            text: hoverText,
            hoverinfo: 'text'
        });
    }
    
    const layout = {
        title: '3D Document Landscape – Fly-through (rotate/zoom)',
        scene: { camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } }, xaxis: { title: 'UMAP-1' }, yaxis: { title: 'UMAP-2' }, zaxis: { title: 'UMAP-3' } },
        margin: { l: 0, r: 0, b: 0, t: 50 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#eef5ff' }
    };
    
    Plotly.newPlot(scatterDiv, traces, layout);
    currentPlotData = traces;
    currentLayout = layout;
    
    // Topic keywords sidebar
    topicKeywordsDiv.innerHTML = '';
    for (const [tid, keywords] of Object.entries(topicKeywords)) {
        const div = document.createElement('div');
        div.innerHTML = `<strong>Topic ${tid}</strong>: ${keywords.join(', ')}`;
        topicKeywordsDiv.appendChild(div);
    }
    
    // Anomaly list
    anomalyList.innerHTML = '';
    anomalies.slice(0, 10).forEach(a => {
        const li = document.createElement('li');
        li.innerHTML = `📄 ${a.filename} (score: ${a.anomaly_score.toFixed(2)})<br><small>${a.preview.substring(0,80)}</small>`;
        anomalyList.appendChild(li);
    });
    
    // Load trends
    loadTrends();
}

async function loadTrends() {
    const res = await fetch('/trends');
    const data = await res.json();
    if (!data.months) return;
    const ctx = document.getElementById('trendChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.months,
            datasets: data.series.map(s => ({ label: `Topic ${s.topic}`, data: s.data, borderColor: '#5f9eff', fill: false, tension: 0.2 }))
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top', labels: { color: '#ccc' } } } }
    });
}

async function uploadFiles(files) {
    const formData = new FormData();
    for (let file of files) formData.append('files', file);
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    alert(`Uploaded ${data.uploaded.length} files.`);
    await scanRaw();
}

async function scanRaw() {
    await fetch('/scan-raw', { method: 'POST' });
}

async function processModeling() {
    processBtn.innerText = '⏳ Processing...';
    const res = await fetch('/process', { method: 'POST' });
    const data = await res.json();
    processBtn.innerText = '🔥 Run Topic Modeling';
    if (data.status === 'success') {
        alert(`Model trained on ${data.documents} documents.`);
        await renderScatter();
    } else {
        alert(`Error: ${data.message}`);
    }
}

async function showCorrelation() {
    const res = await fetch('/correlation?dataset_a=web_upload&dataset_b=raw_folder');
    const corr = await res.json();
    const modalContent = document.getElementById('correlationMatrix');
    if (corr.error) modalContent.innerHTML = `<p>${corr.error}</p>`;
    else modalContent.innerHTML = `<p>🔗 Similarity between <strong>${corr.dataset_a}</strong> and <strong>${corr.dataset_b}</strong>: <span style="font-size:2rem;">${(corr.similarity*100).toFixed(1)}%</span></p><p>High value indicates strong semantic overlap.</p>`;
    correlationModal.style.display = 'flex';
}

function resetCamera() {
    if (currentLayout) {
        currentLayout.scene.camera = { eye: { x: 1.5, y: 1.5, z: 1.5 } };
        Plotly.relayout(scatterDiv, 'scene.camera', currentLayout.scene.camera);
    }
}

// ---- Event listeners ----
uploadZone.onclick = () => fileInput.click();
fileInput.onchange = (e) => uploadFiles(Array.from(e.target.files));
scanBtn.onclick = async () => { await scanRaw(); renderScatter(); };
processBtn.onclick = processModeling;
correlateBtn.onclick = showCorrelation;
resetViewBtn.onclick = resetCamera;
closeModal.onclick = () => correlationModal.style.display = 'none';
window.onclick = (e) => { if(e.target === correlationModal) correlationModal.style.display = 'none'; };

// Drag & drop
uploadZone.ondragover = (e) => { e.preventDefault(); uploadZone.style.background = 'rgba(100,150,255,0.2)'; };
uploadZone.ondragleave = () => { uploadZone.style.background = ''; };
uploadZone.ondrop = async (e) => {
    e.preventDefault();
    uploadZone.style.background = '';
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
};

// ----- Geographic visualization -----
let geoPoints = [];
let currentGeoMode = '3d';

async function fetchGeoData() {
    const res = await fetch('/geo-data');
    const data = await res.json();
    geoPoints = data.points;
    return geoPoints;
}

function renderGeo3D(points) {
    const traces = [];
    // Group by shape for coloring (like your sample)
    const shapes = [...new Set(points.map(p => p.shape).filter(s => s))];
    const colorMap = {};
    shapes.forEach((s, i) => colorMap[s] = `hsl(${i * 360 / shapes.length}, 70%, 60%)`);
    
    for (const shape of shapes) {
        const pts = points.filter(p => p.shape === shape);
        if (!pts.length) continue;
        traces.push({
            x: pts.map(p => new Date(p.date_posted).getTime()), // time as x-axis
            y: pts.map(p => p.longitude),
            z: pts.map(p => p.latitude),
            mode: 'markers',
            type: 'scatter3d',
            name: shape,
            marker: {
                size: pts.map(p => Math.min(15, Math.max(3, p.comment_length / 50))),
                color: colorMap[shape],
                opacity: 0.7
            },
            text: pts.map(p => `${p.filename}<br>Shape: ${p.shape}<br>Len: ${p.comment_length}<br>${p.text_preview.substring(0,100)}`),
            hoverinfo: 'text'
        });
    }
    const layout = {
        title: 'Incidents over Time & Space (X=Date, Y=Longitude, Z=Latitude)',
        scene: {
            xaxis: { title: 'Date Posted', type: 'date' },
            yaxis: { title: 'Longitude' },
            zaxis: { title: 'Latitude' }
        },
        margin: { l: 0, r: 0, b: 0, t: 50 }
    };
    Plotly.newPlot('geoPlot', traces, layout);
}

function renderGeo2DAnimated(points) {
    // Prepare data for animation by year_month
    const frames = [];
    const months = [...new Set(points.map(p => p.year_month).filter(m => m))].sort();
    const shapes = [...new Set(points.map(p => p.shape).filter(s => s))];
    
    for (const month of months) {
        const pts = points.filter(p => p.year_month === month);
        const data = shapes.map(shape => {
            const shapePts = pts.filter(p => p.shape === shape);
            return {
                x: shapePts.map(p => p.longitude),
                y: shapePts.map(p => p.latitude),
                mode: 'markers',
                type: 'scatter',
                name: shape,
                marker: { size: shapePts.map(p => Math.min(12, p.comment_length / 80)), sizemode: 'area' },
                text: shapePts.map(p => p.filename)
            };
        });
        frames.push({ name: month, data: data });
    }
    
    const firstFrame = frames[0].data;
    const layout = {
        title: 'Incident Map Animation by Month',
        xaxis: { title: 'Longitude' },
        yaxis: { title: 'Latitude' },
        updatemenus: [{
            type: 'buttons',
            showactive: false,
            buttons: [{
                label: 'Play',
                method: 'animate',
                args: [null, { fromcurrent: true, frame: { duration: 500, redraw: true }, transition: { duration: 0 } }]
            }]
        }],
        sliders: [{
            active: 0,
            steps: months.map((m, idx) => ({
                label: m,
                method: 'animate',
                args: [[m], { mode: 'immediate', frame: { duration: 0, redraw: true }, transition: { duration: 0 } }]
            }))
        }]
    };
    Plotly.newPlot('geoPlot', firstFrame, layout).then(() => {
        Plotly.addFrames('geoPlot', frames);
    });
}

async function loadGeoView() {
    const points = await fetchGeoData();
    if (!points.length) {
        document.getElementById('geoPlot').innerHTML = '<div>No geographic data found. Upload CSV with latitude/longitude columns.</div>';
        return;
    }
    if (currentGeoMode === '3d') renderGeo3D(points);
    else renderGeo2DAnimated(points);
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        if (tabId === 'topic') {
            document.getElementById('topicView').classList.add('active');
            if (currentPlotData) Plotly.newPlot(scatterDiv, currentPlotData, currentLayout);
            else renderScatter();
        } else {
            document.getElementById('geoView').classList.add('active');
            loadGeoView();
        }
    });
});

// Mode selector for geo
document.getElementById('geoMode')?.addEventListener('change', (e) => {
    currentGeoMode = e.target.value;
    loadGeoView();
});

// Call renderScatter as before, and also preload geo data in background
renderScatter();
fetchGeoData(); // preload
