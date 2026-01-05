import React, { useEffect, useState } from 'react';
import { fetchDataFiles, deleteDataFile } from '@/api';
import type { DataFileInfo } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Download, Eye, FileText, Search, Trash2 } from 'lucide-react';

const DataView: React.FC = () => {
    const [files, setFiles] = useState<DataFileInfo[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<DataFileInfo[]>([]);
    const [search, setSearch] = useState('');
    const [platformFilter, setPlatformFilter] = useState('all');

    useEffect(() => {
        fetchDataFiles().then(data => {
            setFiles(data);
            setFilteredFiles(data);
        });
    }, []);

    useEffect(() => {
        let result = files;
        if (platformFilter !== 'all') {
            result = result.filter(f => f.path.includes(platformFilter));
        }
        if (search) {
            result = result.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
        }
        setFilteredFiles(result);
    }, [search, platformFilter, files]);

    const handleDownload = (path: string) => {
        window.open(`/api/data/download/${path}`, '_blank');
    };

    const handleDelete = async (path: string) => {
        if (confirm('确定要删除这个文件吗？')) {
            try {
                await deleteDataFile(path);
                const data = await fetchDataFiles();
                setFiles(data);
                // Filtering will happen automatically in useEffect
            } catch (error) {
                console.error("Delete failed", error);
                alert("删除失败");
            }
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (ts: number) => {
        return new Date(ts * 1000).toLocaleString();
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-lg border border-border">
                <div className="flex items-center gap-4 flex-1">
                    <Search className="w-5 h-5 text-muted-foreground" />
                    <Input
                        placeholder="搜索文件..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="max-w-sm border-none bg-transparent focus-visible:ring-0 px-0"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} className="w-[150px]">
                        <option value="all">所有平台</option>
                        <option value="xhs">小红书</option>
                        <option value="dy">抖音</option>
                        <option value="bili">Bilibili</option>
                        <option value="wb">微博</option>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredFiles.map((file) => (
                    <Card key={file.path} className="overflow-hidden hover:border-primary/50 transition-colors group">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium truncate pr-4" title={file.name}>
                                {file.name}
                            </CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{file.record_count !== undefined ? file.record_count : '-'} <span className="text-xs font-normal text-muted-foreground">条记录</span></div>
                            <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                                <span>{formatSize(file.size)}</span>
                                <span>{formatDate(file.modified_at)}</span>
                            </div>
                            <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => handleDownload(file.path)}>
                                    <Download className="w-4 h-4 mr-2" /> 下载
                                </Button>
                                <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleDelete(file.path)}>
                                    <Trash2 className="w-4 h-4 mr-2" /> 删除
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {filteredFiles.length === 0 && (
                    <div className="col-span-full text-center p-10 text-muted-foreground">未找到文件。</div>
                )}
            </div>
        </div>
    );
};

export default DataView;
