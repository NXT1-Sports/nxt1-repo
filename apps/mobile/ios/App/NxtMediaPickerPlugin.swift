import Foundation
import UIKit
import Capacitor
import Photos
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

@objc(NxtMediaPickerPlugin)
public class NxtMediaPickerPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "NxtMediaPickerPlugin"
    public let jsName = "NxtMediaPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "chooseFromLibrary", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var includeMetadata = false

    @objc func chooseFromLibrary(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingCall = call
            self.includeMetadata = call.getBool("includeMetadata") ?? false

            var configuration = PHPickerConfiguration(photoLibrary: PHPhotoLibrary.shared())
            let allowMultipleSelection = call.getBool("allowMultipleSelection") ?? false
            let selectionLimit = allowMultipleSelection ? (call.getInt("limit") ?? 0) : 1
            let mediaType = call.getInt("mediaType") ?? 2

            configuration.selectionLimit = max(selectionLimit, 1)
            if allowMultipleSelection && selectionLimit == 0 {
                configuration.selectionLimit = 0
            }
            configuration.filter = self.resolveFilter(for: mediaType)
            configuration.preferredAssetRepresentationMode = .current

            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self

            if call.getString("presentationStyle") == "popover" {
                picker.modalPresentationStyle = .popover
            } else {
                picker.modalPresentationStyle = .fullScreen
            }

            print("[NxtMediaPicker] Opening library picker mediaType=\(mediaType) selectionLimit=\(configuration.selectionLimit) includeMetadata=\(self.includeMetadata)")
            guard let viewController = self.bridge?.viewController else {
                call.reject("Unable to open photo library")
                self.pendingCall = nil
                return
            }
            viewController.present(picker, animated: true)
        }
    }

    private func resolveFilter(for mediaType: Int) -> PHPickerFilter {
        switch mediaType {
        case 0:
            return .images
        case 1:
            return .videos
        default:
            return .any(of: [.images, .videos])
        }
    }

    private func finishResolve(_ results: [NxtNativeMediaResult]) {
        DispatchQueue.main.async {
            self.pendingCall?.resolve([
                "results": results.map { $0.asDictionary() }
            ])
            self.pendingCall = nil
        }
    }

    private func finishReject(_ message: String) {
        DispatchQueue.main.async {
            self.pendingCall?.reject(message)
            self.pendingCall = nil
        }
    }
}

extension NxtMediaPickerPlugin: PHPickerViewControllerDelegate {
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true, completion: nil)

        guard !results.isEmpty else {
            finishReject("User cancelled photos app")
            return
        }

        processResults(results, index: 0, accumulated: [])
    }

    private func processResults(
        _ results: [PHPickerResult],
        index: Int,
        accumulated: [NxtNativeMediaResult]
    ) {
        guard index < results.count else {
            finishResolve(accumulated)
            return
        }

        let pickerResult = results[index]
        let itemProvider = pickerResult.itemProvider
        let asset = pickerResult.assetIdentifier.flatMap {
            PHAsset.fetchAssets(withLocalIdentifiers: [$0], options: nil).firstObject
        }

        if let asset, asset.mediaType == .video {
            processVideoResult(pickerResult, asset: asset) { [weak self] result in
                guard let self else { return }
                guard let result else {
                    self.finishReject("Error loading selected video")
                    return
                }
                self.processResults(results, index: index + 1, accumulated: accumulated + [result])
            }
            return
        }

        if let asset, asset.mediaType == .image {
            processImageResult(pickerResult, asset: asset) { [weak self] result in
                guard let self else { return }
                guard let result else {
                    self.finishReject("Error loading selected image")
                    return
                }
                self.processResults(results, index: index + 1, accumulated: accumulated + [result])
            }
            return
        }

        if itemProvider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            processVideoFallbackResult(pickerResult) { [weak self] result in
                guard let self else { return }
                guard let result else {
                    self.finishReject("Error loading selected video")
                    return
                }
                self.processResults(results, index: index + 1, accumulated: accumulated + [result])
            }
            return
        }

        processImageFallbackResult(pickerResult) { [weak self] result in
            guard let self else { return }
            guard let result else {
                self.finishReject("Error loading selected image")
                return
            }
            self.processResults(results, index: index + 1, accumulated: accumulated + [result])
        }
    }
}

private extension NxtMediaPickerPlugin {
    func processImageResult(
        _ pickerResult: PHPickerResult,
        asset: PHAsset,
        completion: @escaping (NxtNativeMediaResult?) -> Void
    ) {
        let options = PHImageRequestOptions()
        options.version = .current
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true

        print("[NxtMediaPicker] Processing image asset=\(asset.localIdentifier) mode=current-image-data")
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) {
            [weak self] data, uti, _, info in
            guard let self else { return }

            if let error = info?[PHImageErrorKey] as? Error {
                print("[NxtMediaPicker] Failed current image request asset=\(asset.localIdentifier) error=\(error.localizedDescription)")
                self.processImageFallbackResult(pickerResult, completion: completion)
                return
            }

            guard let data else {
                print("[NxtMediaPicker] Empty current image data asset=\(asset.localIdentifier); falling back to item provider")
                self.processImageFallbackResult(pickerResult, completion: completion)
                return
            }

            do {
                let imageType = uti.flatMap { UTType($0) } ?? .jpeg
                let tempURL = try self.writeDataToTemporaryFile(
                    data,
                    preferredExtension: imageType.preferredFilenameExtension ?? "jpg",
                    prefix: "nxt1-image"
                )
                let metadata = self.includeMetadata ? self.buildImageMetadata(asset: asset, data: data, type: imageType) : nil
                print("[NxtMediaPicker] Image asset=\(asset.localIdentifier) ready uri=\(tempURL.absoluteString)")
                completion(self.makeMediaResult(
                    type: 0,
                    fileURL: tempURL,
                    metadata: metadata,
                    thumbnailBase64: nil
                ))
            } catch {
                print("[NxtMediaPicker] Failed writing current image asset=\(asset.localIdentifier) error=\(error.localizedDescription)")
                self.processImageFallbackResult(pickerResult, completion: completion)
            }
        }
    }

    func processImageFallbackResult(
        _ pickerResult: PHPickerResult,
        completion: @escaping (NxtNativeMediaResult?) -> Void
    ) {
        let itemProvider = pickerResult.itemProvider
        let typeIdentifier = itemProvider.registeredTypeIdentifiers.first(where: {
            UTType($0)?.conforms(to: .image) == true
        }) ?? UTType.image.identifier

        print("[NxtMediaPicker] Processing image fallback mode=item-provider-file typeIdentifier=\(typeIdentifier)")
        itemProvider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] fileURL, error in
            guard let self else { return }
            if let error {
                print("[NxtMediaPicker] Image fallback failed error=\(error.localizedDescription)")
                completion(nil)
                return
            }
            guard let fileURL else {
                completion(nil)
                return
            }

            do {
                let copiedURL = try self.copyTemporaryFile(
                    from: fileURL,
                    preferredExtension: fileURL.pathExtension.isEmpty ? "jpg" : fileURL.pathExtension,
                    prefix: "nxt1-image-fallback"
                )
                let fileData = try Data(contentsOf: copiedURL)
                let type = UTType(filenameExtension: copiedURL.pathExtension) ?? .jpeg
                completion(self.makeMediaResult(
                    type: 0,
                    fileURL: copiedURL,
                    metadata: self.includeMetadata
                        ? self.buildFallbackImageMetadata(data: fileData, type: type)
                        : nil,
                    thumbnailBase64: nil
                ))
            } catch {
                print("[NxtMediaPicker] Image fallback copy failed error=\(error.localizedDescription)")
                completion(nil)
            }
        }
    }

    func processVideoResult(
        _ pickerResult: PHPickerResult,
        asset: PHAsset,
        completion: @escaping (NxtNativeMediaResult?) -> Void
    ) {
        let options = PHVideoRequestOptions()
        options.version = .current
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true

        print("[NxtMediaPicker] Processing video asset=\(asset.localIdentifier) mode=current-avasset-export version=current networkAccessAllowed=true")
        PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { [weak self] avAsset, _, info in
            guard let self else { return }

            if let error = info?[PHImageErrorKey] as? Error {
                print("[NxtMediaPicker] Current video request failed asset=\(asset.localIdentifier) error=\(error.localizedDescription)")
                self.processVideoFallbackResult(pickerResult, completion: completion)
                return
            }

            guard let avAsset else {
                print("[NxtMediaPicker] Empty current video asset=\(asset.localIdentifier); falling back to item provider")
                self.processVideoFallbackResult(pickerResult, completion: completion)
                return
            }

            self.exportVideoAsset(avAsset, assetIdentifier: asset.localIdentifier, creationDate: asset.creationDate) { exportedURL, metadata, thumbnailBase64 in
                guard let exportedURL, let metadata else {
                    print("[NxtMediaPicker] Exporting current video failed asset=\(asset.localIdentifier); falling back to item provider")
                    self.processVideoFallbackResult(pickerResult, completion: completion)
                    return
                }

                print("[NxtMediaPicker] Video asset=\(asset.localIdentifier) ready mode=current-avasset-export uri=\(exportedURL.absoluteString) size=\(metadata.size ?? -1)")
                completion(self.makeMediaResult(
                    type: 1,
                    fileURL: exportedURL,
                    metadata: self.includeMetadata ? metadata : nil,
                    thumbnailBase64: thumbnailBase64
                ))
            }
        }
    }

    func processVideoFallbackResult(
        _ pickerResult: PHPickerResult,
        completion: @escaping (NxtNativeMediaResult?) -> Void
    ) {
        let itemProvider = pickerResult.itemProvider
        let typeIdentifier = itemProvider.registeredTypeIdentifiers.first(where: {
            UTType($0)?.conforms(to: .movie) == true
        }) ?? UTType.movie.identifier

        print("[NxtMediaPicker] Processing video fallback mode=item-provider-file-representation typeIdentifier=\(typeIdentifier)")
        itemProvider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] fileURL, error in
            guard let self else { return }
            if let error {
                print("[NxtMediaPicker] Video fallback failed error=\(error.localizedDescription)")
                completion(nil)
                return
            }
            guard let fileURL else {
                completion(nil)
                return
            }

            do {
                let copiedURL = try self.copyTemporaryFile(
                    from: fileURL,
                    preferredExtension: fileURL.pathExtension.isEmpty ? "mov" : fileURL.pathExtension,
                    prefix: "nxt1-video-fallback"
                )
                let avAsset = AVURLAsset(url: copiedURL)
                let metadata = self.includeMetadata
                    ? self.buildVideoMetadata(for: avAsset, outputURL: copiedURL, creationDate: nil)
                    : nil
                let thumbnailBase64 = self.generateVideoThumbnailBase64(for: avAsset)
                completion(self.makeMediaResult(
                    type: 1,
                    fileURL: copiedURL,
                    metadata: metadata,
                    thumbnailBase64: thumbnailBase64
                ))
            } catch {
                print("[NxtMediaPicker] Video fallback copy failed error=\(error.localizedDescription)")
                completion(nil)
            }
        }
    }

    func exportVideoAsset(
        _ avAsset: AVAsset,
        assetIdentifier: String,
        creationDate: Date?,
        completion: @escaping (URL?, NxtNativeMediaMetadata?, String?) -> Void
    ) {
        let preferredPreset = avAsset is AVComposition ? AVAssetExportPresetHighestQuality : AVAssetExportPresetPassthrough

        guard let exportSession = AVAssetExportSession(asset: avAsset, presetName: preferredPreset)
            ?? AVAssetExportSession(asset: avAsset, presetName: AVAssetExportPresetHighestQuality) else {
            print("[NxtMediaPicker] Unable to create AVAssetExportSession asset=\(assetIdentifier)")
            completion(nil, nil, nil)
            return
        }

        let outputFileType = preferredVideoFileType(for: exportSession) ?? .mov
        let fileExtension = fileExtension(for: outputFileType)
        let outputURL = temporaryFileURL(prefix: "nxt1-video", fileExtension: fileExtension)

        try? FileManager.default.removeItem(at: outputURL)

        exportSession.outputURL = outputURL
        exportSession.outputFileType = outputFileType
        exportSession.shouldOptimizeForNetworkUse = true

        print("[NxtMediaPicker] Exporting video asset=\(assetIdentifier) preset=\(exportSession.presetName) fileType=\(outputFileType.rawValue)")
        exportSession.exportAsynchronously { [weak self] in
            guard let self else { return }

            switch exportSession.status {
            case .completed:
                let metadata = self.buildVideoMetadata(for: avAsset, outputURL: outputURL, creationDate: creationDate)
                let thumbnailBase64 = self.generateVideoThumbnailBase64(for: AVURLAsset(url: outputURL))
                completion(outputURL, metadata, thumbnailBase64)
            case .failed, .cancelled:
                let message = exportSession.error?.localizedDescription ?? "unknown export error"
                print("[NxtMediaPicker] Video export failed asset=\(assetIdentifier) error=\(message)")
                completion(nil, nil, nil)
            default:
                completion(nil, nil, nil)
            }
        }
    }

    func makeMediaResult(
        type: Int,
        fileURL: URL,
        metadata: NxtNativeMediaMetadata?,
        thumbnailBase64: String?
    ) -> NxtNativeMediaResult? {
        guard let webURL = bridge?.portablePath(fromLocalURL: fileURL) else {
            return nil
        }

        return NxtNativeMediaResult(
            type: type,
            uri: fileURL.absoluteString,
            saved: false,
            webPath: webURL.absoluteString,
            metadata: metadata,
            thumbnail: thumbnailBase64
        )
    }

    func writeDataToTemporaryFile(
        _ data: Data,
        preferredExtension: String,
        prefix: String
    ) throws -> URL {
        let fileURL = temporaryFileURL(prefix: prefix, fileExtension: preferredExtension)
        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }

    func copyTemporaryFile(
        from sourceURL: URL,
        preferredExtension: String,
        prefix: String
    ) throws -> URL {
        let destinationURL = temporaryFileURL(prefix: prefix, fileExtension: preferredExtension)
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
        return destinationURL
    }

    func temporaryFileURL(prefix: String, fileExtension: String) -> URL {
        let sanitizedExtension = fileExtension.trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("\(prefix)-\(UUID().uuidString).\(sanitizedExtension)")
    }

    func preferredVideoFileType(for exportSession: AVAssetExportSession) -> AVFileType? {
        let supported = exportSession.supportedFileTypes
        if supported.contains(.mp4) { return .mp4 }
        if supported.contains(.mov) { return .mov }
        if supported.contains(.m4v) { return .m4v }
        return supported.first
    }

    func fileExtension(for fileType: AVFileType) -> String {
        switch fileType {
        case .mp4:
            return "mp4"
        case .m4v:
            return "m4v"
        default:
            return "mov"
        }
    }

    func buildImageMetadata(
        asset: PHAsset,
        data: Data,
        type: UTType
    ) -> NxtNativeMediaMetadata {
        NxtNativeMediaMetadata(
            size: data.count,
            duration: nil,
            format: type.preferredFilenameExtension ?? "jpg",
            resolution: "\(asset.pixelWidth)x\(asset.pixelHeight)",
            creationDate: asset.creationDate?.ISO8601Format()
        )
    }

    func buildFallbackImageMetadata(
        data: Data,
        type: UTType
    ) -> NxtNativeMediaMetadata {
        NxtNativeMediaMetadata(
            size: data.count,
            duration: nil,
            format: type.preferredFilenameExtension ?? "jpg",
            resolution: nil,
            creationDate: nil
        )
    }

    func buildVideoMetadata(
        for asset: AVAsset,
        outputURL: URL,
        creationDate: Date?
    ) -> NxtNativeMediaMetadata {
        let attributes = try? FileManager.default.attributesOfItem(atPath: outputURL.path)
        let size = (attributes?[.size] as? NSNumber)?.intValue
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        let resolution = videoResolutionString(for: asset)
        let format = outputURL.pathExtension.isEmpty ? "mov" : outputURL.pathExtension.lowercased()

        return NxtNativeMediaMetadata(
            size: size,
            duration: durationSeconds.isFinite ? durationSeconds : nil,
            format: format,
            resolution: resolution,
            creationDate: creationDate?.ISO8601Format()
        )
    }

    func videoResolutionString(for asset: AVAsset) -> String? {
        guard let track = asset.tracks(withMediaType: .video).first else {
            return nil
        }

        let transformedSize = track.naturalSize.applying(track.preferredTransform)
        let width = Int(abs(transformedSize.width))
        let height = Int(abs(transformedSize.height))
        guard width > 0, height > 0 else {
            return nil
        }
        return "\(width)x\(height)"
    }

    func generateVideoThumbnailBase64(for asset: AVAsset) -> String? {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 960, height: 960)

        let seconds = min(max(CMTimeGetSeconds(asset.duration) * 0.1, 0), 1)
        let time = CMTime(seconds: seconds, preferredTimescale: 600)

        do {
            let image = try generator.copyCGImage(at: time, actualTime: nil)
            let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.8)
            return data?.base64EncodedString()
        } catch {
            return nil
        }
    }
}

private struct NxtNativeMediaResult {
    let type: Int
    let uri: String
    let saved: Bool
    let webPath: String
    let metadata: NxtNativeMediaMetadata?
    let thumbnail: String?

    func asDictionary() -> [String: Any] {
        var result: [String: Any] = [
            "type": type,
            "uri": uri,
            "saved": saved,
            "webPath": webPath
        ]
        if let metadata {
            result["metadata"] = metadata.asDictionary()
        }
        if let thumbnail {
            result["thumbnail"] = thumbnail
        }
        return result
    }
}

private struct NxtNativeMediaMetadata {
    let size: Int?
    let duration: Double?
    let format: String
    let resolution: String?
    let creationDate: String?

    func asDictionary() -> [String: Any] {
        var result: [String: Any] = [
            "format": format
        ]
        if let size {
            result["size"] = size
        }
        if let duration {
            result["duration"] = duration
        }
        if let resolution {
            result["resolution"] = resolution
        }
        if let creationDate {
            result["creationDate"] = creationDate
        }
        return result
    }
}
